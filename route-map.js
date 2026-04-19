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

      this.activeRoute = null;
      this.pendingRoute = null;

      this.render = {
        progress:0,
        exitProgress:0,
        cameraAngle:0,
        pulse:0,
        transitionT:1
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
      const nextRoute = this.createRoute(turnType, turnDist, remainDist);

      if(!this.activeRoute){
        this.activeRoute = nextRoute;
        return;
      }

      if(this.isSameTurn(this.activeRoute, nextRoute)){
        this.activeRoute.turnDist = nextRoute.turnDist;
        this.activeRoute.remainDist = nextRoute.remainDist;
        return;
      }

      this.pendingRoute = nextRoute;
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

    createRoute(turnType, turnDist, remainDist){
      return {
        turnType,
        kind:this.getTurnKind(turnType),
        turnDist,
        remainDist
      };
    }

    isSameTurn(currentRoute, nextRoute){
      if(!currentRoute) return false;
      if(currentRoute.turnType !== nextRoute.turnType) return false;
      if(nextRoute.turnDist > currentRoute.turnDist + 150 && currentRoute.turnDist < 70){
        return false;
      }
      return true;
    }

    getTurnKind(turnType){
      if(TURN_LEFT_TYPES.has(turnType)) return "left";
      if(TURN_RIGHT_TYPES.has(turnType)) return "right";
      if(TURN_ROUND_TYPES.has(turnType)) return "round";
      if(TURN_STRAIGHT_TYPES.has(turnType)) return "straight";
      return "straight";
    }

    getProgressTarget(turnDist){
      const dist = Math.max(0, Number(turnDist) || 0);
      if(dist >= 10000) return 0.03;
      if(dist >= 5000) return 0.06;
      if(dist >= 2000) return 0.12;
      if(dist >= 1000) return 0.18;
      if(dist >= 500) return 0.28;
      if(dist >= 250) return 0.4;
      if(dist >= 120) return 0.54;
      if(dist >= 60) return 0.68;
      if(dist >= 30) return 0.8;
      if(dist >= 12) return 0.9;
      if(dist >= 3) return 0.97;
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
      if(!this.ctx || !this.width || !this.height || !this.activeRoute) return;

      const speedBoost = Math.min(1.6, 0.85 + this.state.speed / 100);
      const targetProgress = this.state.visible ? this.getProgressTarget(this.activeRoute.turnDist) : 0;
      const desiredProgress = this.pendingRoute ? 1 : targetProgress;
      const progressRate = this.pendingRoute ? 0.72 : 1.65 * speedBoost;
      this.render.progress = this.lerp(this.render.progress, desiredProgress, dt * progressRate);

      const currentDone = this.render.progress > 0.992;
      if(currentDone){
        this.render.exitProgress = Math.min(1, this.render.exitProgress + dt * 0.58);
      }else{
        this.render.exitProgress = 0;
      }

      const targetAngle = this.getCameraAngle(this.activeRoute.kind, this.render.progress, this.render.exitProgress);
      this.render.cameraAngle = this.lerp(this.render.cameraAngle, targetAngle, dt * 3.6);
      this.render.pulse += dt * 1.15;
      this.render.transitionT = Math.min(1, this.render.transitionT + dt * 2.2);

      if(this.pendingRoute && this.render.exitProgress >= 1){
        this.previousDisplay = null;
        this.render.transitionT = 0;
        this.activeRoute = this.pendingRoute;
        this.pendingRoute = null;
        this.render.progress = 0.03;
        this.render.exitProgress = 0;
      }

      this.draw(time);
    }

    getCameraAngle(kind, progress, exitProgress){
      if(kind === "straight") return 0;
      const turnAmount = kind === "left" ? -0.24 : 0.24;
      if(kind === "round"){
        return this.lerp(0, 0.2, Math.max(0, (progress - 0.72) / 0.28));
      }
      const enter = Math.max(0, Math.min(1, (progress - 0.74) / 0.18));
      const settle = Math.max(enter, exitProgress);
      return turnAmount * settle;
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const carPoint = {x:width * 0.5, y:height - 14};
      const worldPath = this.buildWorldPath(this.activeRoute.kind, width, height);
      const transformed = this.projectPath(worldPath, carPoint, this.render.progress, this.render.exitProgress, this.render.cameraAngle);
      const extended = this.extendToNext(transformed, width, height);
      const points = this.blendDisplayPath(extended);
      const carIndex = this.findClosestPointIndex(points, carPoint.x, carPoint.y);

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height);
      this.drawRouteGlow(ctx, points);
      this.drawRouteBase(ctx, points);
      this.drawDrivenTrail(ctx, points, carIndex);
      this.drawManeuverMarker(ctx, transformed.turnPoint, this.activeRoute.kind, time);
      this.drawCar(ctx, carPoint, time);
    }

    buildWorldPath(kind, width, height){
      const straightIn = height * 0.95;
      const straightOut = height * 0.9;
      const lane = Math.min(22, width * 0.2);
      const points = [];

      const addPoint = (x, y) => points.push({x, y});

      if(kind === "left"){
        addPoint(0, 22);
        addPoint(0, -20);
        addPoint(-6, -34);
        addPoint(-lane * 0.55, -48);
        addPoint(-lane, -60);
        addPoint(-lane * 1.6, -straightOut);
      }else if(kind === "right"){
        addPoint(0, 22);
        addPoint(0, -20);
        addPoint(6, -34);
        addPoint(lane * 0.55, -48);
        addPoint(lane, -60);
        addPoint(lane * 1.6, -straightOut);
      }else if(kind === "round"){
        const radius = Math.min(12, width * 0.14);
        addPoint(0, 22);
        addPoint(0, -20);
        for(let i = 0; i <= 16; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.14 * (i / 16));
          addPoint(Math.cos(angle) * radius, -40 + Math.sin(angle) * radius);
        }
        addPoint(radius * 1.7, -straightOut * 0.8);
      }else{
        addPoint(0, 22);
        addPoint(0, -straightIn);
      }

      return points;
    }

    projectPath(worldPath, carPoint, progress, exitProgress, cameraAngle){
      const shiftY = this.getForwardShift(progress, exitProgress, this.height);
      const points = worldPath.map(point => {
        const rotated = this.rotatePoint(point.x, point.y + shiftY, cameraAngle);
        return {
          x:carPoint.x + rotated.x,
          y:carPoint.y + rotated.y
        };
      });

      const turnIndex = Math.min(points.length - 1, Math.max(1, Math.floor(points.length * 0.4)));
      return {
        points,
        turnPoint:points[turnIndex]
      };
    }

    getForwardShift(progress, exitProgress, height){
      const far = -height * 0.78;
      const near = -18;
      const approach = Math.min(1, progress / 0.88);
      const approachShift = this.lerp(far, near, Math.pow(approach, 0.96));
      if(progress < 0.88){
        return approachShift;
      }
      return this.lerp(near, height * 0.28, exitProgress);
    }

    rotatePoint(x, y, angle){
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return {
        x:x * cos - y * sin,
        y:x * sin + y * cos
      };
    }

    extendToNext(basePoints, width, height){
      const points = basePoints.points.map(point => ({...point}));
      const last = points[points.length - 1];
      if(!last) return points;

      const futureKind = this.pendingRoute ? this.pendingRoute.kind : "straight";
      const topY = -18;
      const lane = Math.min(15, width * 0.14);

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
      const leadY = last.y - height * 0.16;
      addLine(last.x, last.y, leadX, leadY, 8);

      if(futureKind === "left"){
        addQuad(leadX, leadY, leadX, leadY - 5, leadX - lane, leadY - 5, 8);
        addLine(leadX - lane, leadY - 5, leadX - lane * 1.8, topY, 8);
      }else if(futureKind === "right"){
        addQuad(leadX, leadY, leadX, leadY - 5, leadX + lane, leadY - 5, 8);
        addLine(leadX + lane, leadY - 5, leadX + lane * 1.8, topY, 8);
      }else if(futureKind === "round"){
        const radius = Math.min(7, width * 0.08);
        for(let i = 1; i <= 10; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.04 * (i / 10));
          points.push({
            x:leadX + Math.cos(angle) * radius,
            y:leadY + Math.sin(angle) * radius
          });
        }
        addLine(leadX + radius, leadY, leadX + radius * 1.7, topY, 6);
      }else{
        addLine(leadX, leadY, leadX, topY, 10);
      }

      return points;
    }

    blendDisplayPath(targetPoints){
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

    drawManeuverMarker(ctx, anchor, kind, time){
      if(kind === "straight" || !anchor) return;
      const pulse = 0.5 + Math.sin(this.render.pulse * 1.7 + time * 0.6) * 0.5;

      ctx.save();
      ctx.globalAlpha = 0.14 + pulse * 0.06;
      ctx.fillStyle = "#6fd3ff";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 7 + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#6fd3ff";
      ctx.lineWidth = 1.4;

      if(kind === "left" || kind === "right"){
        const dir = kind === "left" ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(anchor.x - dir * 3, anchor.y);
        ctx.lineTo(anchor.x + dir * 5, anchor.y);
        ctx.stroke();
      }else if(kind === "round"){
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
