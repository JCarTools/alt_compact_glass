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

      this.currentRoute = null;
      this.nextRoute = null;

      this.render = {
        approach:0,
        depart:0,
        cameraAngle:0,
        morph:1,
        pulse:0
      };

      this.displayPoints = null;
      this.previousPoints = null;
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
      if(b.turnDist > a.turnDist + 150 && a.turnDist < 80){
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
          return Math.PI / 3.4;
        case 6:
        case 7:
          return Math.PI / 2.2;
        case 8:
        case 19:
          return Math.PI * 0.9;
        case 24:
          return Math.PI * 1.2;
        case 55:
          return Math.PI * 0.9;
        default:
          return 0;
      }
    }

    getApproachTarget(turnDist){
      const d = Math.max(0, Number(turnDist) || 0);
      if(d >= 10000) return 0.04;
      if(d >= 5000) return 0.08;
      if(d >= 2000) return 0.14;
      if(d >= 1000) return 0.22;
      if(d >= 500) return 0.34;
      if(d >= 250) return 0.46;
      if(d >= 120) return 0.58;
      if(d >= 60) return 0.7;
      if(d >= 25) return 0.82;
      if(d >= 10) return 0.92;
      if(d >= 3) return 0.98;
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
      const targetApproach = this.state.visible ? this.getApproachTarget(this.currentRoute.turnDist) : 0;
      const desiredApproach = this.nextRoute ? 1 : targetApproach;
      const approachRate = this.nextRoute ? 0.72 : 1.4 * speedBoost;
      this.render.approach = this.lerp(this.render.approach, desiredApproach, dt * approachRate);

      const currentPassed = this.render.approach > 0.992;
      if(currentPassed){
        this.render.depart = Math.min(1, this.render.depart + dt * 0.52);
      }else{
        this.render.depart = 0;
      }

      const targetAngle = this.getCameraRotation(this.currentRoute, this.render.approach, this.render.depart);
      this.render.cameraAngle = this.lerp(this.render.cameraAngle, targetAngle, dt * 3.2);

      this.render.morph = Math.min(1, this.render.morph + dt * 2);
      this.render.pulse += dt;

      if(this.nextRoute && this.render.depart >= 1){
        this.previousPoints = this.displayPoints ? this.displayPoints.map(point => ({...point})) : null;
        this.currentRoute = this.nextRoute;
        this.nextRoute = null;
        this.render.approach = 0.04;
        this.render.depart = 0;
        this.render.morph = 0;
      }

      this.draw(time);
    }

    getCameraRotation(route, approach, depart){
      if(!route || route.kind === "straight") return 0;
      const turnT = Math.max(0, Math.min(1, (approach - 0.78) / 0.22));
      const settled = Math.max(turnT, depart);
      if(route.kind === "round"){
        return route.direction * route.angle * 0.28 * settled;
      }
      return route.direction * route.angle * 0.48 * settled;
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const car = {x:width * 0.5, y:height - 14};

      const road = this.buildRoad(this.currentRoute, this.nextRoute, width, height);
      const points = this.getDisplayPoints(road.points);
      const carIndex = this.findClosestPointIndex(points, car.x, car.y);

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height);
      this.drawRouteGlow(ctx, points);
      this.drawRouteBase(ctx, points);
      this.drawDrivenTrail(ctx, points, carIndex);
      this.drawManeuverMarker(ctx, road.turnMarker, this.currentRoute, time);
      this.drawCar(ctx, car, time);
    }

    buildRoad(route, nextRoute, width, height){
      const car = {x:width * 0.5, y:height - 14};
      const lane = Math.min(20, width * 0.18);
      const world = [];

      const addLine = (x1, y1, x2, y2, segments = 14) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          world.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuad = (x1, y1, cx1, cy1, x2, y2, segments = 18) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          world.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      const forwardShift = this.getForwardShift(height);
      const turnAnchorY = -20;
      let turnMarker = {x:0, y:turnAnchorY};

      if(route.kind === "straight"){
        addLine(0, 28, 0, -height * 1.2, 32);
      }else if(route.kind === "round"){
        const radius = Math.min(12, width * 0.14);
        addLine(0, 28, 0, -18, 16);
        for(let i = 0; i <= 24; i++){
          const a = Math.PI * 0.62 + route.direction * (route.angle * (i / 24));
          world.push({
            x:Math.sin(a) * radius,
            y:-42 - Math.cos(a) * radius
          });
        }
        turnMarker = {x:0, y:-42};
        const last = world[world.length - 1];
        const heading = route.direction * route.angle * 0.68;
        addLine(last.x, last.y, last.x + Math.sin(heading) * height, last.y - Math.cos(heading) * height, 20);
      }else{
        const radius = Math.max(10, Math.min(18, route.angle * 16));
        addLine(0, 28, 0, -18, 16);

        const startAngle = route.direction === -1 ? 0 : Math.PI;
        const endAngle = startAngle + route.direction * route.angle;
        const centerX = route.direction * radius;
        const centerY = -18;

        for(let i = 0; i <= 20; i++){
          const t = i / 20;
          const a = this.lerp(startAngle, endAngle, t);
          world.push({
            x:centerX + Math.cos(a) * radius,
            y:centerY + Math.sin(a) * radius
          });
        }

        turnMarker = {x:0, y:-18};
        const last = world[world.length - 1];
        const heading = endAngle + route.direction * Math.PI / 2;
        addLine(last.x, last.y, last.x + Math.cos(heading) * height, last.y + Math.sin(heading) * height, 22);
      }

      this.appendNextRoad(world, nextRoute, width, height);

      const cameraAngle = this.render.cameraAngle;
      const points = world.map(point => {
        const shifted = {x:point.x, y:point.y + forwardShift};
        const rotated = this.rotatePoint(shifted.x, shifted.y, cameraAngle);
        return {
          x:car.x + rotated.x,
          y:car.y + rotated.y
        };
      });

      const shiftedMarker = this.rotatePoint(turnMarker.x, turnMarker.y + forwardShift, cameraAngle);
      return {
        points,
        turnMarker:{
          x:car.x + shiftedMarker.x,
          y:car.y + shiftedMarker.y
        }
      };
    }

    appendNextRoad(world, nextRoute, width, height){
      const last = world[world.length - 1];
      if(!last) return;

      const future = nextRoute || {kind:"straight", direction:0, angle:0};
      const lane = Math.min(14, width * 0.13);

      const addLine = (x1, y1, x2, y2, segments = 8) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          world.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuad = (x1, y1, cx1, cy1, x2, y2, segments = 10) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          world.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      const leadY = last.y - height * 0.24;
      addLine(last.x, last.y, last.x, leadY, 8);

      if(future.kind === "turn"){
        addQuad(last.x, leadY, last.x, leadY - 6, last.x + future.direction * lane, leadY - 6, 10);
        addLine(last.x + future.direction * lane, leadY - 6, last.x + future.direction * lane * 2.1, leadY - height * 0.28, 8);
      }else if(future.kind === "round"){
        const radius = Math.min(7, width * 0.08);
        for(let i = 1; i <= 12; i++){
          const a = Math.PI * 0.62 + future.direction * (future.angle * 0.55 * (i / 12));
          world.push({
            x:last.x + Math.sin(a) * radius,
            y:leadY - 18 - Math.cos(a) * radius
          });
        }
        addLine(last.x + future.direction * radius * 1.4, leadY - 18, last.x + future.direction * radius * 2, leadY - height * 0.28, 6);
      }else{
        addLine(last.x, leadY, last.x, leadY - height * 0.3, 10);
      }
    }

    getForwardShift(height){
      const far = -height * 0.82;
      const near = -28;
      const approach = Math.min(1, this.render.approach / 0.88);
      const approachShift = this.lerp(far, near, Math.pow(approach, 0.95));
      if(this.render.approach < 0.88){
        return approachShift;
      }
      return this.lerp(near, height * 0.22, this.render.depart);
    }

    rotatePoint(x, y, angle){
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x:x * cos - y * sin,
        y:x * sin + y * cos
      };
    }

    getDisplayPoints(targetPoints){
      const sampledTarget = this.samplePoints(targetPoints, 72);
      if(!this.previousDisplay || this.render.morph >= 1){
        this.previousDisplay = sampledTarget;
        this.displayPoints = sampledTarget;
        return sampledTarget;
      }

      const sampledFrom = this.samplePoints(this.previousDisplay, sampledTarget.length);
      const eased = 1 - Math.pow(1 - this.render.morph, 3);
      const blended = sampledTarget.map((point, index) => ({
        x:this.lerp(sampledFrom[index].x, point.x, eased),
        y:this.lerp(sampledFrom[index].y, point.y, eased)
      }));

      if(this.render.morph >= 0.999){
        this.previousDisplay = sampledTarget;
      }

      this.displayPoints = blended;
      return blended;
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
      const pulse = 0.5 + Math.sin(this.render.pulse * 1.5 + time * 0.45) * 0.5;

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
