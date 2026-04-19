(()=>{
  const TURN_LEFT_TYPES = new Set([2, 4, 6, 8]);
  const TURN_RIGHT_TYPES = new Set([3, 5, 7, 19]);
  const TURN_STRAIGHT_TYPES = new Set([9, 15, 49]);
  const TURN_ROUND_TYPES = new Set([24, 55]);

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
        progress:0,
        blend:1,
        pulse:0
      };

      this.previousScreenPoints = null;
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
      if(b.turnDist > a.turnDist + 160 && a.turnDist < 80){
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
          return Math.PI / 7;
        case 2:
        case 3:
          return Math.PI / 3.5;
        case 6:
        case 7:
          return Math.PI / 2.25;
        case 8:
        case 19:
          return Math.PI * 0.92;
        case 24:
          return Math.PI * 1.18;
        case 55:
          return Math.PI * 0.9;
        default:
          return 0;
      }
    }

    getProgressTarget(turnDist){
      const d = Math.max(0, Number(turnDist) || 0);
      if(d >= 10000) return 0.08;
      if(d >= 5000) return 0.14;
      if(d >= 2000) return 0.22;
      if(d >= 1000) return 0.3;
      if(d >= 500) return 0.4;
      if(d >= 250) return 0.5;
      if(d >= 120) return 0.6;
      if(d >= 60) return 0.7;
      if(d >= 30) return 0.8;
      if(d >= 12) return 0.9;
      if(d >= 3) return 0.97;
      return 1;
    }

    lerp(from, to, factor){
      return from + (to - from) * factor;
    }

    loop(now){
      const dt = Math.min(0.06, (now - this.lastFrame) / 1000 || 0.016);
      this.lastFrame = now;
      this.tick(dt, now / 1000);
      requestAnimationFrame(this.loop);
    }

    tick(dt, time){
      if(!this.ctx || !this.width || !this.height || !this.currentRoute) return;

      const speedBoost = Math.min(1.5, 0.9 + this.state.speed / 120);
      const target = this.state.visible ? this.getProgressTarget(this.currentRoute.turnDist) : 0;
      const desired = this.nextRoute ? 1 : target;
      const rate = this.nextRoute ? 0.6 : 1.25 * speedBoost;
      this.render.progress = this.lerp(this.render.progress, desired, dt * rate);
      this.render.blend = Math.min(1, this.render.blend + dt * 2);
      this.render.pulse += dt;

      if(this.nextRoute && this.render.progress > 0.995){
        this.previousRoute = this.currentRoute;
        this.currentRoute = this.nextRoute;
        this.nextRoute = null;
        this.render.progress = this.getProgressTarget(this.currentRoute.turnDist);
        this.render.blend = 0;
        this.previousScreenPoints = null;
      }

      this.draw(time);
    }

    draw(time){
      const ctx = this.ctx;
      const car = {x:this.width * 0.5, y:this.height - 14};
      const model = this.buildRouteModel(this.currentRoute, this.nextRoute, this.width, this.height);
      const projected = this.projectRoute(model, car, this.render.progress);
      const points = this.blendScreenPoints(projected.points);
      const carIndex = this.findClosestPointIndex(points, car.x, car.y);

      ctx.clearRect(0, 0, this.width, this.height);
      this.drawBackground(ctx, this.width, this.height);
      this.drawRouteGlow(ctx, points);
      this.drawRouteBase(ctx, points);
      this.drawDrivenTrail(ctx, points, carIndex);
      this.drawManeuverMarker(ctx, projected.currentMarker, this.currentRoute, time);
      this.drawCar(ctx, car, time);
    }

    buildRouteModel(currentRoute, nextRoute, width, height){
      const world = [];
      const previewDistance = height * 0.34;
      const afterDistance = height * 0.95;
      const beforeDistance = height * 0.58;

      const addStraight = (heading, length, segments = 12) => {
        const start = world.length ? world[world.length - 1] : {x:0, y:0};
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          world.push({
            x:start.x + Math.cos(heading) * length * t,
            y:start.y + Math.sin(heading) * length * t
          });
        }
      };

      const addTurn = (startHeading, direction, angle, radius, segments = 18) => {
        const start = world[world.length - 1];
        let heading = startHeading;
        let point = {x:start.x, y:start.y};
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          const nextHeading = startHeading + direction * angle * t;
          const stepHeading = (heading + nextHeading) / 2;
          const step = radius * angle / segments;
          point = {
            x:point.x + Math.cos(stepHeading) * step,
            y:point.y + Math.sin(stepHeading) * step
          };
          world.push(point);
          heading = nextHeading;
        }
        return heading;
      };

      world.push({x:0, y:beforeDistance});

      const incomingHeading = -Math.PI / 2;
      addStraight(incomingHeading, beforeDistance, 14);
      const markerIndex = world.length - 1;

      let heading = incomingHeading;

      if(currentRoute.kind === "turn"){
        heading = addTurn(incomingHeading, currentRoute.direction, currentRoute.angle, Math.max(22, currentRoute.angle * 28), 20);
        addStraight(heading, afterDistance, 22);
      }else if(currentRoute.kind === "round"){
        heading = addTurn(incomingHeading, currentRoute.direction || 1, currentRoute.angle, 18, 26);
        addStraight(heading, afterDistance * 0.86, 18);
      }else{
        addStraight(heading, afterDistance, 24);
      }

      if(nextRoute){
        const start = world[world.length - 1];
        const future = [];
        future.push(start);
        const futureAddStraight = (length, segments = 8) => {
          const base = future[future.length - 1];
          for(let i = 1; i <= segments; i++){
            const t = i / segments;
            future.push({
              x:base.x + Math.cos(heading) * length * t,
              y:base.y + Math.sin(heading) * length * t
            });
          }
        };

        const futureAddTurn = (direction, angle, radius, segments = 14) => {
          let localHeading = heading;
          let point = future[future.length - 1];
          for(let i = 1; i <= segments; i++){
            const t = i / segments;
            const nextHeading = heading + direction * angle * t;
            const stepHeading = (localHeading + nextHeading) / 2;
            const step = radius * angle / segments;
            point = {
              x:point.x + Math.cos(stepHeading) * step,
              y:point.y + Math.sin(stepHeading) * step
            };
            future.push(point);
            localHeading = nextHeading;
          }
        };

        futureAddStraight(previewDistance, 10);
        if(nextRoute.kind === "turn"){
          futureAddTurn(nextRoute.direction, nextRoute.angle * 0.85, Math.max(14, nextRoute.angle * 20), 12);
        }else if(nextRoute.kind === "round"){
          futureAddTurn(nextRoute.direction || 1, nextRoute.angle * 0.5, 12, 14);
        }else{
          futureAddStraight(previewDistance * 0.7, 8);
        }

        future.shift();
        world.push(...future);
      }

      return {
        points:world,
        markerIndex
      };
    }

    projectRoute(model, car, progress){
      const carPos = this.getPointAt(model.points, progress);
      const lookAhead = this.getPointAt(model.points, Math.min(0.999, progress + 0.03));
      const heading = Math.atan2(lookAhead.y - carPos.y, lookAhead.x - carPos.x);
      const rotation = -Math.PI / 2 - heading;

      const points = model.points.map(point => {
        const relative = {
          x:point.x - carPos.x,
          y:point.y - carPos.y
        };
        const rotated = this.rotatePoint(relative.x, relative.y, rotation);
        return {
          x:car.x + rotated.x,
          y:car.y + rotated.y
        };
      });

      const markerSource = model.points[Math.min(model.points.length - 1, model.markerIndex)];
      const markerRelative = {
        x:markerSource.x - carPos.x,
        y:markerSource.y - carPos.y
      };
      const markerRotated = this.rotatePoint(markerRelative.x, markerRelative.y, rotation);

      return {
        points:this.samplePoints(points, 72),
        currentMarker:{
          x:car.x + markerRotated.x,
          y:car.y + markerRotated.y
        }
      };
    }

    rotatePoint(x, y, angle){
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x:x * cos - y * sin,
        y:x * sin + y * cos
      };
    }

    blendScreenPoints(targetPoints){
      if(!this.previousScreenPoints || this.render.blend >= 1){
        this.previousScreenPoints = targetPoints;
        return targetPoints;
      }

      const source = this.samplePoints(this.previousScreenPoints, targetPoints.length);
      const eased = 1 - Math.pow(1 - this.render.blend, 3);
      const blended = targetPoints.map((point, index) => ({
        x:this.lerp(source[index].x, point.x, eased),
        y:this.lerp(source[index].y, point.y, eased)
      }));

      if(this.render.blend >= 0.999){
        this.previousScreenPoints = targetPoints;
      }

      return blended;
    }

    getPointAt(points, t){
      if(!points.length) return {x:0, y:0};
      if(points.length === 1) return points[0];
      const scaled = Math.max(0, Math.min(0.999, t)) * (points.length - 1);
      const index = Math.floor(scaled);
      const localT = scaled - index;
      const p1 = points[index];
      const p2 = points[Math.min(points.length - 1, index + 1)];
      return {
        x:this.lerp(p1.x, p2.x, localT),
        y:this.lerp(p1.y, p2.y, localT)
      };
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
      ctx.globalAlpha = 0.08;
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
      ctx.globalAlpha = 0.14;
      this.strokePath(ctx, points, "#0e2f42", 10);
      ctx.restore();
    }

    drawRouteBase(ctx, points){
      this.strokePath(ctx, points, "rgba(255,255,255,.12)", 9);
      this.strokePath(ctx, points, "#f4fbff", 4.2);
    }

    drawDrivenTrail(ctx, points, carIndex){
      if(points.length < 2) return;
      const startIndex = Math.max(0, carIndex - 18);
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
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for(let i = 1; i < points.length; i++){
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawManeuverMarker(ctx, anchor, route, time){
      if(!route || route.kind === "straight" || !anchor) return;
      const pulse = 0.5 + Math.sin(this.render.pulse * 1.4 + time * 0.45) * 0.5;

      ctx.save();
      ctx.globalAlpha = 0.14 + pulse * 0.06;
      ctx.fillStyle = "#6fd3ff";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 7 + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#6fd3ff";
      ctx.lineWidth = 1.4;

      if(route.kind === "turn"){
        const dir = route.direction || 1;
        ctx.beginPath();
        ctx.moveTo(anchor.x - dir * 3, anchor.y);
        ctx.lineTo(anchor.x + dir * 5, anchor.y);
        ctx.stroke();
      }else if(route.kind === "round"){
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 5, Math.PI * 0.62, Math.PI * 1.8);
        ctx.stroke();
      }
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
