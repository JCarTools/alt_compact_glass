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

      this.renderState = {
        progress:0,
        exitProgress:0,
        pulse:0,
        transitionT:1
      };
      this.transitionFromPoints = null;
      this.displayPoints = null;

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
      const signature = `${turnType}:${remainDist > 0 ? 1 : 0}`;

      if(!this.activeRoute){
        this.activeRoute = this.createRoute(turnType, turnDist, remainDist, signature);
        return;
      }

      if(this.isSameTurn(this.activeRoute, turnType, turnDist)){
        this.activeRoute.turnDist = turnDist;
        this.activeRoute.remainDist = remainDist;
        return;
      }

      this.pendingRoute = this.createRoute(turnType, turnDist, remainDist, signature);
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

    createRoute(turnType, turnDist, remainDist, signature){
      return {
        turnType,
        turnDist,
        remainDist,
        signature
      };
    }

    isSameTurn(route, nextType, nextDist){
      if(!route) return false;
      if(route.turnType !== nextType) return false;
      const routeKind = this.getTurnKind(route.turnType);
      const nextKind = this.getTurnKind(nextType);
      if(routeKind !== nextKind) return false;
      if(nextDist > route.turnDist + 120 && route.turnDist < 70){
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

    getTargetProgress(dist){
      const value = Math.max(0, Number(dist) || 0);
      if(value >= 10000) return 0.03;
      if(value >= 5000) return 0.06;
      if(value >= 2000) return 0.12;
      if(value >= 1000) return 0.18;
      if(value >= 500) return 0.28;
      if(value >= 300) return 0.38;
      if(value >= 150) return 0.5;
      if(value >= 80) return 0.62;
      if(value >= 40) return 0.74;
      if(value >= 20) return 0.84;
      if(value >= 8) return 0.92;
      if(value >= 2) return 0.98;
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

      const speedBoost = Math.min(1.7, 0.8 + this.state.speed / 100);
      const targetProgress = this.state.visible ? this.getTargetProgress(this.activeRoute.turnDist) : 0;
      const desiredProgress = this.pendingRoute ? 1 : targetProgress;
      const followRate = this.pendingRoute ? 0.7 : 1.9 * speedBoost;

      this.renderState.progress = this.lerp(this.renderState.progress, desiredProgress, dt * followRate);
      this.renderState.pulse += dt * 1.4;

      const passedCurrent = this.renderState.progress > 0.992;
      if(passedCurrent){
        this.renderState.exitProgress = Math.min(1, this.renderState.exitProgress + dt * 0.72);
      }else{
        this.renderState.exitProgress = 0;
      }

      if(this.pendingRoute && this.renderState.exitProgress >= 1){
        this.transitionFromPoints = this.displayPoints ? this.displayPoints.map(point => ({...point})) : null;
        this.renderState.transitionT = 0;
        this.activeRoute = this.pendingRoute;
        this.pendingRoute = null;
        this.renderState.progress = 0.04;
        this.renderState.exitProgress = 0;
      }

      this.draw(time);
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const kind = this.getTurnKind(this.activeRoute.turnType);
      const path = this.buildPath(kind, this.renderState.progress, this.renderState.exitProgress, width, height);
      this.renderState.transitionT = Math.min(1, this.renderState.transitionT + 0.06);
      const points = this.getDisplayPoints(path.points);
      const carIndex = this.findClosestPointIndex(points, path.carPoint.x, path.carPoint.y);
      const displayPath = {
        ...path,
        points,
        carIndex
      };

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height);
      this.drawRouteGlow(ctx, points);
      this.drawRouteBase(ctx, points);
      this.drawDrivenTrail(ctx, points, carIndex);
      this.drawManeuverMarker(ctx, displayPath, kind, time);
      this.drawCar(ctx, path.carPoint, time);
    }

    buildPath(kind, progress, exitProgress, width, height){
      const cx = width * 0.5;
      const carY = height - 14;
      const roadShift = this.getRoadShift(progress, exitProgress, height);
      const turnWorldY = carY - 20;
      const turnY = turnWorldY + roadShift;
      const laneOffset = Math.min(20, width * 0.18);
      const points = [];

      const addLine = (x1, y1, x2, y2, segments = 12) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          points.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuadratic = (x1, y1, cx1, cy1, x2, y2, segments = 18) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          points.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      if(kind === "left"){
        const bendX = cx - laneOffset;
        const exitX = cx - laneOffset * 2.2;
        const exitY = turnY - height * 0.52;
        addLine(cx, carY + 10, cx, turnY + 14, 20);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 20);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
        this.appendFutureRoad(points, exitX, exitY, -1, width, height);
      }else if(kind === "right"){
        const bendX = cx + laneOffset;
        const exitX = cx + laneOffset * 2.2;
        const exitY = turnY - height * 0.52;
        addLine(cx, carY + 10, cx, turnY + 14, 20);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 20);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
        this.appendFutureRoad(points, exitX, exitY, 1, width, height);
      }else if(kind === "round"){
        const radius = Math.min(12, width * 0.14);
        const exitX = cx + radius * 1.9;
        const exitY = turnY - height * 0.46;
        addLine(cx, carY + 10, cx, turnY + radius + 12, 18);
        for(let i = 0; i <= 28; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.22 * (i / 28));
          points.push({
            x:cx + Math.cos(angle) * radius,
            y:turnY + Math.sin(angle) * radius
          });
        }
        addLine(cx + radius, turnY, exitX, exitY, 14);
        this.appendFutureRoad(points, exitX, exitY, 1, width, height);
      }else{
        addLine(cx, carY + 10, cx, -18, 34);
      }

      return {
        points,
        carPoint:{x:cx, y:carY},
        turnY,
        showManeuver:progress > 0.08
      };
    }

    getRoadShift(progress, exitProgress, height){
      const farShift = -height * 0.76;
      const approach = Math.min(1, progress / 0.86);
      const approachShift = this.lerp(farShift, 0, Math.pow(approach, 0.96));
      if(progress < 0.86){
        return approachShift;
      }
      return this.lerp(0, height * 0.34, Math.max(exitProgress, (progress - 0.86) / 0.14));
    }

    appendFutureRoad(points, startX, startY, direction, width, height){
      const pendingKind = this.pendingRoute ? this.getTurnKind(this.pendingRoute.turnType) : "straight";
      const top = -18;
      const futureOffset = Math.min(14, width * 0.13);
      const carryX = startX + direction * futureOffset * 1.6;
      const carryY = startY - height * 0.2;

      const addLine = (x1, y1, x2, y2, segments = 8) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          points.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuadratic = (x1, y1, cx1, cy1, x2, y2, segments = 12) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          points.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      addLine(startX, startY, carryX, carryY, 10);
      const leadX = carryX;
      const leadY = carryY;

      if(pendingKind === "left"){
        addQuadratic(leadX, leadY, leadX, leadY - 6, leadX - futureOffset, leadY - 6, 10);
        addLine(leadX - futureOffset, leadY - 6, leadX - futureOffset * 1.7, top, 8);
      }else if(pendingKind === "right"){
        addQuadratic(leadX, leadY, leadX, leadY - 6, leadX + futureOffset, leadY - 6, 10);
        addLine(leadX + futureOffset, leadY - 6, leadX + futureOffset * 1.7, top, 8);
      }else if(pendingKind === "round"){
        const radius = Math.min(7, width * 0.08);
        for(let i = 1; i <= 12; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.08 * (i / 12));
          points.push({
            x:leadX + Math.cos(angle) * radius,
            y:leadY + Math.sin(angle) * radius
          });
        }
        addLine(leadX + radius, leadY, leadX + radius * 1.7, top, 6);
      }else{
        addLine(leadX, leadY, leadX, top, 10);
      }
    }

    getDisplayPoints(targetPoints){
      const sampledTarget = this.samplePoints(targetPoints, 72);
      if(!this.transitionFromPoints || this.renderState.transitionT >= 1){
        this.displayPoints = sampledTarget;
        this.transitionFromPoints = sampledTarget;
        return sampledTarget;
      }

      const sampledFrom = this.samplePoints(this.transitionFromPoints, sampledTarget.length);
      const eased = 1 - Math.pow(1 - this.renderState.transitionT, 3);
      const blended = sampledTarget.map((point, index) => ({
        x:this.lerp(sampledFrom[index].x, point.x, eased),
        y:this.lerp(sampledFrom[index].y, point.y, eased)
      }));

      this.displayPoints = blended;
      if(this.renderState.transitionT >= 0.999){
        this.transitionFromPoints = sampledTarget;
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

    drawManeuverMarker(ctx, path, kind, time){
      if(!path.showManeuver || kind === "straight") return;
      const pulse = 0.5 + Math.sin(this.renderState.pulse * 1.8 + time * 0.6) * 0.5;
      const anchor = this.getPointAt(path.points, 0.62);

      ctx.save();
      ctx.globalAlpha = 0.16 + pulse * 0.08;
      ctx.fillStyle = "#6fd3ff";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 7 + pulse * 1.5, 0, Math.PI * 2);
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
        ctx.arc(anchor.x, anchor.y, 5, Math.PI * 0.6, Math.PI * 1.8);
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
