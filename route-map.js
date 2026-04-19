(()=>{
  const TURN_LEFT_TYPES = new Set([2, 4, 6, 8]);
  const TURN_RIGHT_TYPES = new Set([3, 5, 7, 19]);
  const TURN_STRAIGHT_TYPES = new Set([9, 15, 49]);
  const TURN_ROUND_TYPES = new Set([24, 55]);

  const CAMERA_SPEED = {
    cruise: 0.18,
    approach: 0.4,
    commit: 0.78,
    carry: 0.56
  };

  class PseudoRouteMap {
    constructor(root, canvas){
      this.root = root;
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
      this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

      this.state = {
        visible:false,
        speed:0,
        heading:0
      };

      this.previousRoute = null;
      this.currentRoute = null;
      this.nextRoute = null;

      this.render = {
        pathProgress:0.12,
        targetProgress:0.12,
        heading:0,
        pulse:0
      };

      this.lastFrame = performance.now();
      this.resize();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize(){
      if(!this.canvas || !this.ctx) return;
      const width = this.canvas.clientWidth || this.canvas.width;
      const height = this.canvas.clientHeight || this.canvas.height;
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.width = width;
      this.height = height;
    }

    setVisible(visible){
      this.state.visible = !!visible;
      if(this.root){
        this.root.classList.toggle("visible", this.state.visible);
      }
    }

    update(data){
      const route = this.makeRoute(
        Number(data.turnType) || 9,
        Math.max(0, Number(data.turnDist) || 0),
        Math.max(0, Number(data.remainDist) || 0)
      );

      if(!this.currentRoute){
        this.currentRoute = route;
        this.render.pathProgress = this.getTargetProgress(route.turnDist);
        this.render.targetProgress = this.render.pathProgress;
        return;
      }

      if(this.isSameRoute(this.currentRoute, route)){
        this.currentRoute.turnDist = route.turnDist;
        this.currentRoute.remainDist = route.remainDist;
        return;
      }

      if(this.nextRoute && this.isSameRoute(this.nextRoute, route)){
        this.nextRoute.turnDist = route.turnDist;
        this.nextRoute.remainDist = route.remainDist;
        return;
      }

      this.nextRoute = route;
    }

    updateGps(data){
      if(data.speed !== undefined){
        const speed = Number(data.speed);
        if(Number.isFinite(speed)){
          this.state.speed = Math.max(0, speed);
        }
      }
      if(data.heading !== undefined){
        const heading = Number(data.heading);
        if(Number.isFinite(heading)){
          this.state.heading = heading;
        }
      }
    }

    makeRoute(turnType, turnDist, remainDist){
      return {
        turnType,
        kind:this.getTurnKind(turnType),
        direction:this.getDirection(turnType),
        angle:this.getTurnAngle(turnType),
        turnDist,
        remainDist
      };
    }

    isSameRoute(a, b){
      if(!a || !b) return false;
      if(a.turnType !== b.turnType) return false;
      if(b.turnDist > a.turnDist + 180 && a.turnDist < 100){
        return false;
      }
      return true;
    }

    getTurnKind(turnType){
      if(TURN_ROUND_TYPES.has(turnType)) return "round";
      if(TURN_STRAIGHT_TYPES.has(turnType)) return "straight";
      if(TURN_LEFT_TYPES.has(turnType) || TURN_RIGHT_TYPES.has(turnType)) return "turn";
      return "straight";
    }

    getDirection(turnType){
      if(TURN_LEFT_TYPES.has(turnType)) return -1;
      if(TURN_RIGHT_TYPES.has(turnType)) return 1;
      return 0;
    }

    getTurnAngle(turnType){
      switch(turnType){
        case 4:
        case 5:
          return Math.PI / 8;
        case 2:
        case 3:
          return Math.PI / 2.5;
        case 6:
        case 7:
          return Math.PI / 1.85;
        case 8:
        case 19:
          return Math.PI * 0.9;
        case 24:
          return Math.PI * 1.34;
        case 55:
          return Math.PI * 0.96;
        default:
          return 0;
      }
    }

    getTargetProgress(turnDist){
      const d = Math.max(0, Number(turnDist) || 0);
      if(d >= 10000) return 0.08;
      if(d >= 5000) return 0.11;
      if(d >= 2000) return 0.16;
      if(d >= 1000) return 0.21;
      if(d >= 500) return 0.28;
      if(d >= 250) return 0.38;
      if(d >= 120) return 0.52;
      if(d >= 60) return 0.67;
      if(d >= 30) return 0.8;
      if(d >= 12) return 0.9;
      if(d >= 4) return 0.97;
      return 1.02;
    }

    lerp(from, to, factor){
      return from + (to - from) * factor;
    }

    clamp(value, min, max){
      return Math.max(min, Math.min(max, value));
    }

    normalizeAngle(angle){
      let next = angle;
      while(next > Math.PI) next -= Math.PI * 2;
      while(next < -Math.PI) next += Math.PI * 2;
      return next;
    }

    loop(now){
      const dt = Math.min(0.06, (now - this.lastFrame) / 1000 || 0.016);
      this.lastFrame = now;
      this.tick(dt, now / 1000);
      requestAnimationFrame(this.loop);
    }

    tick(dt, time){
      if(!this.ctx || !this.width || !this.height || !this.currentRoute) return;

      const speedBoost = this.clamp(0.88 + this.state.speed / 65, 0.88, 1.8);
      const target = this.state.visible ? this.getTargetProgress(this.currentRoute.turnDist) : 0.12;
      this.render.targetProgress = this.nextRoute
        ? Math.max(target, 1.04)
        : target;

      const delta = this.render.targetProgress - this.render.pathProgress;
      let follow = CAMERA_SPEED.cruise;
      if(this.nextRoute){
        follow = this.render.pathProgress < 0.82 ? CAMERA_SPEED.commit : CAMERA_SPEED.carry;
      }else if(target > 0.78){
        follow = CAMERA_SPEED.approach;
      }

      this.render.pathProgress += delta * this.clamp(dt * follow * speedBoost * 3.4, 0.02, 0.34);
      this.render.pulse += dt;

      if(this.nextRoute && this.render.pathProgress >= 1.015){
        this.previousRoute = this.currentRoute;
        this.currentRoute = this.nextRoute;
        this.nextRoute = null;
        this.render.pathProgress = Math.min(0.36, this.getTargetProgress(this.currentRoute.turnDist));
      }

      this.draw(time, dt);
    }

    draw(time, dt){
      const ctx = this.ctx;
      const car = {x:this.width * 0.5, y:this.height - 15};
      const model = this.buildWorldModel();
      const desiredHeading = this.getCameraHeading(model.points);
      const headingDelta = this.normalizeAngle(desiredHeading - this.render.heading);
      this.render.heading += headingDelta * this.clamp(dt * 4.8, 0.06, 0.26);
      const projected = this.projectWorld(model, car, this.render.heading);
      const carIndex = this.findClosestPointIndex(projected.points, car.x, car.y);

      ctx.clearRect(0, 0, this.width, this.height);
      this.drawBackground(ctx, this.width, this.height);
      this.drawRouteGlow(ctx, projected.points);
      this.drawRouteBase(ctx, projected.points);
      this.drawDrivenTrail(ctx, projected.points, carIndex);
      this.drawManeuverMarker(ctx, projected.maneuverPoint, this.currentRoute, time);
      this.drawFutureMarker(ctx, projected.nextPoint, this.nextRoute);
      this.drawCar(ctx, car, time);
    }

    buildWorldModel(){
      const points = [];
      const segmentMeta = {
        maneuverIndex:0,
        nextIndex:0
      };

      points.push({x:0, y:180});

      this.extendStraight(points, 0, 180, 18);
      segmentMeta.maneuverIndex = points.length - 1;

      this.appendCurrentManeuver(points, this.currentRoute);
      const exitHeading = this.getPathHeading(points, points.length - 4, points.length - 1);

      this.extendStraight(points, exitHeading, 96, 10);
      segmentMeta.nextIndex = points.length - 1;

      if(this.nextRoute){
        const previewDistance = this.getPreviewDistance(this.nextRoute.turnDist);
        this.extendStraight(points, exitHeading, previewDistance, 10);
        segmentMeta.nextIndex = points.length - 1;
        this.appendPreviewManeuver(points, this.nextRoute, exitHeading);
      }else{
        this.extendStraight(points, exitHeading, 120, 12);
      }

      return {
        points,
        maneuverIndex:segmentMeta.maneuverIndex,
        nextIndex:segmentMeta.nextIndex
      };
    }

    extendStraight(points, heading, distance, steps){
      const start = points[points.length - 1];
      for(let i = 1; i <= steps; i++){
        const t = i / steps;
        points.push({
          x:start.x + Math.sin(heading) * distance * t,
          y:start.y - Math.cos(heading) * distance * t
        });
      }
    }

    appendCurrentManeuver(points, route){
      if(!route || route.kind === "straight"){
        this.extendStraight(points, 0, 156, 18);
        return;
      }

      if(route.kind === "round"){
        this.appendRoundabout(points, route.direction || 1, route.angle, 15, 22, 120);
        return;
      }

      this.appendAngularTurn(points, route.direction || 1, route.angle, 42, 118);
    }

    appendPreviewManeuver(points, route, heading){
      if(!route || route.kind === "straight"){
        this.extendStraight(points, heading, 60, 6);
        return;
      }

      if(route.kind === "round"){
        this.appendRoundaboutPreview(points, route.direction || 1, heading, route.angle, 10, 12, 52);
        return;
      }

      this.appendAngularPreview(points, route.direction || 1, heading, route.angle, 18, 58);
    }

    appendAngularTurn(points, direction, angle, cornerLead, exitLength){
      const start = points[points.length - 1];
      const splitA = {
        x:start.x,
        y:start.y - cornerLead
      };
      const turnHeading = direction * angle;
      const splitB = {
        x:splitA.x + Math.sin(turnHeading) * (cornerLead * 0.78),
        y:splitA.y - Math.cos(turnHeading) * (cornerLead * 0.78)
      };
      const end = {
        x:splitB.x + Math.sin(turnHeading) * exitLength,
        y:splitB.y - Math.cos(turnHeading) * exitLength
      };

      this.pushLinear(points, splitA, 5);
      this.pushLinear(points, splitB, 4);
      this.pushLinear(points, end, 12);
    }

    appendAngularPreview(points, direction, baseHeading, angle, cornerLead, exitLength){
      const start = points[points.length - 1];
      const splitA = {
        x:start.x + Math.sin(baseHeading) * cornerLead,
        y:start.y - Math.cos(baseHeading) * cornerLead
      };
      const nextHeading = baseHeading + direction * angle;
      const splitB = {
        x:splitA.x + Math.sin(nextHeading) * (cornerLead * 0.72),
        y:splitA.y - Math.cos(nextHeading) * (cornerLead * 0.72)
      };
      const end = {
        x:splitB.x + Math.sin(nextHeading) * exitLength,
        y:splitB.y - Math.cos(nextHeading) * exitLength
      };

      this.pushLinear(points, splitA, 3);
      this.pushLinear(points, splitB, 3);
      this.pushLinear(points, end, 8);
    }

    appendRoundabout(points, direction, angle, radius, arcSteps, exitLength){
      const start = points[points.length - 1];
      const approach = {
        x:start.x,
        y:start.y - 34
      };
      const center = {
        x:approach.x + direction * radius,
        y:approach.y
      };
      const startAngle = direction === 1 ? Math.PI : 0;
      const sweep = direction * angle;

      this.pushLinear(points, approach, 5);
      for(let i = 1; i <= arcSteps; i++){
        const t = i / arcSteps;
        const a = startAngle + sweep * t;
        points.push({
          x:center.x + Math.cos(a) * radius,
          y:center.y + Math.sin(a) * radius
        });
      }

      const endAngle = startAngle + sweep;
      const endHeading = direction === 1 ? endAngle + Math.PI / 2 : endAngle - Math.PI / 2;
      const end = points[points.length - 1];
      const leave = {
        x:end.x + Math.sin(endHeading) * exitLength,
        y:end.y - Math.cos(endHeading) * exitLength
      };
      this.pushLinear(points, leave, 12);
    }

    appendRoundaboutPreview(points, direction, baseHeading, angle, radius, arcSteps, exitLength){
      const start = points[points.length - 1];
      const approach = {
        x:start.x + Math.sin(baseHeading) * 18,
        y:start.y - Math.cos(baseHeading) * 18
      };
      const centerNormal = baseHeading + direction * Math.PI / 2;
      const center = {
        x:approach.x + Math.sin(centerNormal) * radius,
        y:approach.y - Math.cos(centerNormal) * radius
      };
      const startAngle = Math.atan2(approach.y - center.y, approach.x - center.x);

      this.pushLinear(points, approach, 3);
      for(let i = 1; i <= arcSteps; i++){
        const t = i / arcSteps;
        const a = startAngle + direction * angle * t;
        points.push({
          x:center.x + Math.cos(a) * radius,
          y:center.y + Math.sin(a) * radius
        });
      }

      const endAngle = startAngle + direction * angle;
      const tangent = direction === 1 ? endAngle + Math.PI / 2 : endAngle - Math.PI / 2;
      const end = points[points.length - 1];
      const leave = {
        x:end.x + Math.sin(tangent) * exitLength,
        y:end.y - Math.cos(tangent) * exitLength
      };
      this.pushLinear(points, leave, 8);
    }

    pushLinear(points, endPoint, steps){
      const start = points[points.length - 1];
      for(let i = 1; i <= steps; i++){
        const t = i / steps;
        points.push({
          x:this.lerp(start.x, endPoint.x, t),
          y:this.lerp(start.y, endPoint.y, t)
        });
      }
    }

    getPreviewDistance(turnDist){
      const d = Math.max(0, Number(turnDist) || 0);
      if(d >= 5000) return 96;
      if(d >= 2000) return 74;
      if(d >= 1000) return 62;
      if(d >= 300) return 50;
      if(d >= 100) return 42;
      return 36;
    }

    projectWorld(model, car, cameraHeading){
      const path = model.points;
      const clampedProgress = this.clamp(this.render.pathProgress, 0, 0.999);
      const carPos = this.getPointAt(path, clampedProgress);
      const rotation = -(cameraHeading || 0);

      const points = path.map(point => {
        const relative = {
          x:point.x - carPos.x,
          y:point.y - carPos.y
        };
        const rotated = this.rotate(relative.x, relative.y, rotation);
        return {
          x:car.x + rotated.x,
          y:car.y + rotated.y
        };
      });

      const maneuverSource = path[Math.min(path.length - 1, model.maneuverIndex)];
      const nextSource = path[Math.min(path.length - 1, model.nextIndex)];

      return {
        points:this.samplePoints(points, 96),
        maneuverPoint:this.projectPoint(maneuverSource, carPos, rotation, car),
        nextPoint:this.nextRoute ? this.projectPoint(nextSource, carPos, rotation, car) : null
      };
    }

    getCameraHeading(path){
      const progress = this.clamp(this.render.pathProgress, 0, 0.999);
      const carPos = this.getPointAt(path, progress);
      const ahead = this.getPointAt(path, this.clamp(progress + 0.03, 0, 0.999));
      return Math.atan2(ahead.x - carPos.x, carPos.y - ahead.y);
    }

    projectPoint(point, carPos, rotation, anchor){
      const relative = {
        x:point.x - carPos.x,
        y:point.y - carPos.y
      };
      const rotated = this.rotate(relative.x, relative.y, rotation);
      return {
        x:anchor.x + rotated.x,
        y:anchor.y + rotated.y
      };
    }

    rotate(x, y, angle){
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x:x * cos - y * sin,
        y:x * sin + y * cos
      };
    }

    getPointAt(points, t){
      if(!points.length) return {x:0, y:0};
      if(points.length === 1) return points[0];
      const scaled = this.clamp(t, 0, 0.999) * (points.length - 1);
      const index = Math.floor(scaled);
      const localT = scaled - index;
      const p1 = points[index];
      const p2 = points[Math.min(points.length - 1, index + 1)];
      return {
        x:this.lerp(p1.x, p2.x, localT),
        y:this.lerp(p1.y, p2.y, localT)
      };
    }

    getPathHeading(points, fromIndex, toIndex){
      const a = points[Math.max(0, fromIndex)];
      const b = points[Math.max(0, toIndex)];
      return Math.atan2(b.x - a.x, a.y - b.y);
    }

    samplePoints(points, count){
      if(!points || !points.length) return [];
      const sampled = [];
      for(let i = 0; i < count; i++){
        const t = count === 1 ? 0 : i / (count - 1);
        sampled.push(this.getPointAt(points, t));
      }
      return sampled;
    }

    findClosestPointIndex(points, x, y){
      let bestIndex = 0;
      let bestDistance = Infinity;
      for(let i = 0; i < points.length; i++){
        const dx = points[i].x - x;
        const dy = points[i].y - y;
        const distance = dx * dx + dy * dy;
        if(distance < bestDistance){
          bestDistance = distance;
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    drawBackground(ctx, width, height){
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(14,22,32,.96)");
      gradient.addColorStop(1, "rgba(7,13,21,.92)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = "rgba(152,179,201,.18)";
      ctx.lineWidth = 1;
      for(let x = 10; x < width; x += 14){
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for(let y = 12; y < height; y += 14){
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawRouteGlow(ctx, points){
      ctx.save();
      ctx.globalAlpha = 0.15;
      this.strokePath(ctx, points, "#0e2f42", 10);
      ctx.restore();
    }

    drawRouteBase(ctx, points){
      this.strokePath(ctx, points, "rgba(255,255,255,.12)", 8.5);
      this.strokePath(ctx, points, "#f4fbff", 4);
    }

    drawDrivenTrail(ctx, points, carIndex){
      if(points.length < 2) return;
      const startIndex = Math.max(0, carIndex - 20);
      ctx.save();
      ctx.strokeStyle = "#4ec7ff";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[startIndex].x, points[startIndex].y);
      for(let i = startIndex + 1; i <= carIndex; i++){
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    strokePath(ctx, points, color, width){
      if(points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "miter";
      ctx.miterLimit = 3;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for(let i = 1; i < points.length; i++){
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawManeuverMarker(ctx, point, route, time){
      if(!route || route.kind === "straight" || !point) return;
      const pulse = 0.5 + Math.sin(this.render.pulse * 1.5 + time * 0.5) * 0.5;

      ctx.save();
      ctx.globalAlpha = 0.16 + pulse * 0.05;
      ctx.fillStyle = "#6fd3ff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7 + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = "#6fd3ff";
      ctx.lineWidth = 1.4;

      if(route.kind === "turn"){
        const dir = route.direction || 1;
        ctx.beginPath();
        ctx.moveTo(point.x - dir * 5, point.y + 1);
        ctx.lineTo(point.x, point.y - 4);
        ctx.lineTo(point.x + dir * 5, point.y - 4);
        ctx.stroke();
      }else if(route.kind === "round"){
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5.5, Math.PI * 0.3, Math.PI * 1.82);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFutureMarker(ctx, point, route){
      if(!route || !point) return;
      if(point.y < -20 || point.y > this.height + 20) return;

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(126,231,255,.14)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(126,231,255,.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    drawCar(ctx, point, time){
      const bob = Math.sin(time * 4) * 0.35;
      ctx.save();
      ctx.translate(point.x, point.y + bob);
      ctx.shadowColor = "rgba(78,199,255,.34)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#33b5ff";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.2, 6);
      ctx.lineTo(0, 3.2);
      ctx.lineTo(-5.2, 6);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -2.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  window.PseudoRouteMap = PseudoRouteMap;
})();
