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
        exitProgress:0,
        transitionT:1,
        pulse:0
      };

      this.previousDisplay = null;
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
      const turnType = Number(data.turnType) || 9;
      const turnDist = Math.max(0, Number(data.turnDist) || 0);
      const remainDist = Math.max(turnDist, Number(data.remainDist) || turnDist || 0);
      const next = this.makeRoute(turnType, turnDist, remainDist);

      if(!this.currentRoute){
        this.currentRoute = next;
        return;
      }

      if(this.isSameRoute(this.currentRoute, next)){
        this.currentRoute.turnDist = next.turnDist;
        this.currentRoute.remainDist = next.remainDist;
        return;
      }

      if(this.nextRoute && this.isSameRoute(this.nextRoute, next)){
        this.nextRoute.turnDist = next.turnDist;
        this.nextRoute.remainDist = next.remainDist;
        return;
      }

      this.nextRoute = next;
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
      if(b.turnDist > a.turnDist + 150 && a.turnDist < 70) return false;
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
          return Math.PI / 2.3;
        case 8:
        case 19:
          return Math.PI * 0.92;
        case 24:
          return Math.PI * 1.18;
        case 55:
          return Math.PI * 0.92;
        default:
          return 0;
      }
    }

    getProgressTarget(turnDist){
      const d = Math.max(0, Number(turnDist) || 0);
      if(d >= 10000) return 0.03;
      if(d >= 5000) return 0.06;
      if(d >= 2000) return 0.12;
      if(d >= 1000) return 0.18;
      if(d >= 500) return 0.28;
      if(d >= 250) return 0.4;
      if(d >= 120) return 0.54;
      if(d >= 60) return 0.68;
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

      const speedBoost = Math.min(1.6, 0.85 + this.state.speed / 110);
      const targetProgress = this.state.visible ? this.getProgressTarget(this.currentRoute.turnDist) : 0;
      const desiredProgress = this.nextRoute ? 1 : targetProgress;
      const rate = this.nextRoute ? 0.7 : 1.55 * speedBoost;

      this.render.progress = this.lerp(this.render.progress, desiredProgress, dt * rate);
      this.render.pulse += dt * 1.05;

      const currentPassed = this.render.progress > 0.992;
      if(currentPassed){
        this.render.exitProgress = Math.min(1, this.render.exitProgress + dt * 0.58);
      }else{
        this.render.exitProgress = 0;
      }

      this.render.transitionT = Math.min(1, this.render.transitionT + dt * 2.2);

      if(this.nextRoute && this.render.exitProgress >= 1){
        this.previousRoute = this.currentRoute;
        this.currentRoute = this.nextRoute;
        this.nextRoute = null;
        this.render.progress = 0.03;
        this.render.exitProgress = 0;
        this.render.transitionT = 0;
        this.previousDisplay = null;
      }

      this.draw(time);
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const car = {x:width * 0.5, y:height - 14};

      const routeModel = this.buildRouteModel(this.currentRoute, this.nextRoute, width, height);
      const projected = this.projectRoute(routeModel, car, this.render.progress, this.render.exitProgress);
      const points = this.blendDisplay(projected.points);
      const carIndex = this.findClosestPointIndex(points, car.x, car.y);

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height);
      this.drawRouteGlow(ctx, points);
      this.drawRouteBase(ctx, points);
      this.drawDrivenTrail(ctx, points, carIndex);
      this.drawManeuverMarker(ctx, projected.currentAnchor, this.currentRoute, time);
      this.drawCar(ctx, car, time);
    }

    buildRouteModel(currentRoute, nextRoute, width, height){
      const lane = Math.min(20, width * 0.18);
      const incoming = height * 0.9;
      const outgoing = height * 1.1;
      const points = [];

      const push = (x, y) => points.push({x, y});

      if(currentRoute.kind === "straight"){
        push(0, 30);
        push(0, -incoming);
        return {
          points,
          currentAnchor:{x:0, y:-70}
        };
      }

      if(currentRoute.kind === "round"){
        const radius = Math.min(12, width * 0.14);
        push(0, 30);
        push(0, -20);
        for(let i = 0; i <= 24; i++){
          const angle = Math.PI * 0.62 + currentRoute.direction * (currentRoute.angle * (i / 24));
          push(
            Math.sin(angle) * radius,
            -42 - Math.cos(angle) * radius
          );
        }
        const last = points[points.length - 1];
        const heading = currentRoute.direction * currentRoute.angle * 0.72;
        push(
          last.x + Math.sin(heading) * outgoing,
          last.y - Math.cos(heading) * outgoing
        );
        this.appendNextRoute(points, nextRoute, width, height);
        return {
          points,
          currentAnchor:{x:0, y:-42}
        };
      }

      const radius = Math.max(10, Math.min(18, currentRoute.angle * 16));
      push(0, 30);
      push(0, -20);

      const startAngle = currentRoute.direction === -1 ? 0 : Math.PI;
      const endAngle = startAngle + currentRoute.direction * currentRoute.angle;
      const centerX = currentRoute.direction * radius;
      const centerY = -20;

      for(let i = 0; i <= 20; i++){
        const t = i / 20;
        const angle = this.lerp(startAngle, endAngle, t);
        push(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius
        );
      }

      const last = points[points.length - 1];
      const heading = endAngle + currentRoute.direction * Math.PI / 2;
      push(
        last.x + Math.cos(heading) * outgoing,
        last.y + Math.sin(heading) * outgoing
      );

      this.appendNextRoute(points, nextRoute, width, height);

      return {
        points,
        currentAnchor:{x:0, y:-20}
      };
    }

    appendNextRoute(points, nextRoute, width, height){
      const last = points[points.length - 1];
      if(!last) return;

      const future = nextRoute || {kind:"straight", direction:0, angle:0};
      const lane = Math.min(14, width * 0.13);
      const carry = height * 0.24;

      const addLine = (x1, y1, x2, y2, segments = 8) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          points.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuad = (x1, y1, cx1, cy1, x2, y2, segments = 10) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          points.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      const leadX = last.x;
      const leadY = last.y - carry;
      addLine(last.x, last.y, leadX, leadY, 8);

      if(future.kind === "turn"){
        addQuad(leadX, leadY, leadX, leadY - 6, leadX + future.direction * lane, leadY - 6, 10);
        addLine(leadX + future.direction * lane, leadY - 6, leadX + future.direction * lane * 2.2, leadY - carry, 8);
      }else if(future.kind === "round"){
        const radius = Math.min(7, width * 0.08);
        for(let i = 1; i <= 12; i++){
          const angle = Math.PI * 0.62 + future.direction * (future.angle * 0.55 * (i / 12));
          points.push({
            x:leadX + Math.sin(angle) * radius,
            y:leadY - 18 - Math.cos(angle) * radius
          });
        }
        addLine(leadX + future.direction * radius * 1.4, leadY - 18, leadX + future.direction * radius * 2, leadY - carry, 6);
      }else{
        addLine(leadX, leadY, leadX, leadY - carry, 10);
      }
    }

    projectRoute(routeModel, car, progress, exitProgress){
      const shiftY = this.getForwardShift(progress, exitProgress, this.height);
      const cameraAngle = this.getCameraAngle(this.currentRoute, progress, exitProgress);
      const points = routeModel.points.map(point => {
        const translated = {x:point.x, y:point.y + shiftY};
        const rotated = this.rotatePoint(translated.x, translated.y, cameraAngle);
        return {
          x:car.x + rotated.x,
          y:car.y + rotated.y
        };
      });

      const currentAnchorRotated = this.rotatePoint(routeModel.currentAnchor.x, routeModel.currentAnchor.y + shiftY, cameraAngle);
      return {
        points,
        currentAnchor:{
          x:car.x + currentAnchorRotated.x,
          y:car.y + currentAnchorRotated.y
        }
      };
    }

    getForwardShift(progress, exitProgress, height){
      const far = -height * 0.82;
      const near = -26;
      const approach = Math.min(1, progress / 0.88);
      const approachShift = this.lerp(far, near, Math.pow(approach, 0.95));
      if(progress < 0.88){
        return approachShift;
      }
      return this.lerp(near, height * 0.24, exitProgress);
    }

    getCameraAngle(route, progress, exitProgress){
      if(!route || route.kind === "straight") return 0;
      const rotateT = Math.max(0, Math.min(1, (progress - 0.78) / 0.22));
      const settleT = Math.max(rotateT, exitProgress);
      const amount = route.kind === "round" ? route.angle * 0.34 : route.angle * 0.52;
      return route.direction * amount * settleT;
    }

    rotatePoint(x, y, angle){
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x:x * cos - y * sin,
        y:x * sin + y * cos
      };
    }

    blendDisplay(targetPoints){
      const sampledTarget = this.samplePoints(targetPoints, 72);
      if(!this.previousDisplay || this.render.transitionT >= 1){
        this.previousDisplay = sampledTarget;
        return sampledTarget;
      }

      const sampledFrom = this.samplePoints(this.previousDisplay, sampledTarget.length);
      const eased = 1 - Math.pow(1 - this.render.transitionT, 3);
      const blended = sampledTarget.map((point, index) => ({
        x:this.lerp(sampledFrom[index].x, point.x, eased),
        y:this.lerp(sampledFrom[index].y, point.y, eased)
      }));

      if(this.render.transitionT >= 0.999){
        this.previousDisplay = sampledTarget;
      }

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
        const dist = dx * dx + dy * dy;
        if(dist < bestDistance){
          bestDistance = dist;
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
      const pulse = 0.5 + Math.sin(this.render.pulse * 1.6 + time * 0.5) * 0.5;

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
