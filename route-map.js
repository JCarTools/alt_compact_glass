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
        cameraAngle:0,
        transitionT:1
      };

      this.previousPath = null;
      this.displayPath = null;
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

      if(!this.activeRoute){
        this.activeRoute = this.createRoute(turnType, turnDist, remainDist);
        return;
      }

      if(this.isSameTurn(this.activeRoute, turnType, turnDist)){
        this.activeRoute.turnDist = turnDist;
        this.activeRoute.remainDist = remainDist;
        return;
      }

      this.pendingRoute = this.createRoute(turnType, turnDist, remainDist);
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
        turnDist,
        remainDist,
        kind:this.getTurnKind(turnType)
      };
    }

    isSameTurn(route, turnType, turnDist){
      if(!route) return false;
      if(route.turnType !== turnType) return false;
      if(turnDist > route.turnDist + 150 && route.turnDist < 60){
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
      if(value >= 10000) return 0.02;
      if(value >= 5000) return 0.05;
      if(value >= 2000) return 0.1;
      if(value >= 1000) return 0.16;
      if(value >= 500) return 0.26;
      if(value >= 250) return 0.38;
      if(value >= 120) return 0.5;
      if(value >= 60) return 0.64;
      if(value >= 30) return 0.76;
      if(value >= 10) return 0.88;
      if(value >= 3) return 0.96;
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

      const speedBoost = Math.min(1.7, 0.85 + this.state.speed / 110);
      const targetProgress = this.state.visible ? this.getTargetProgress(this.activeRoute.turnDist) : 0;
      const desiredProgress = this.pendingRoute ? 1 : targetProgress;
      const progressRate = this.pendingRoute ? 0.75 : 1.8 * speedBoost;

      this.renderState.progress = this.lerp(this.renderState.progress, desiredProgress, dt * progressRate);
      this.renderState.pulse += dt * 1.3;

      const currentDone = this.renderState.progress > 0.992;
      if(currentDone){
        this.renderState.exitProgress = Math.min(1, this.renderState.exitProgress + dt * 0.62);
      }else{
        this.renderState.exitProgress = 0;
      }

      const targetCameraAngle = this.getCameraAngle(this.activeRoute.kind, this.renderState.progress, this.renderState.exitProgress);
      this.renderState.cameraAngle = this.lerp(this.renderState.cameraAngle, targetCameraAngle, dt * 4.2);

      if(this.pendingRoute && this.renderState.exitProgress >= 1){
        this.previousPath = this.displayPath ? this.displayPath.map(point => ({...point})) : null;
        this.renderState.transitionT = 0;
        this.activeRoute = this.pendingRoute;
        this.pendingRoute = null;
        this.renderState.progress = 0.02;
        this.renderState.exitProgress = 0;
      }

      this.renderState.transitionT = Math.min(1, this.renderState.transitionT + dt * 2.2);
      this.draw(time);
    }

    getCameraAngle(kind, progress, exitProgress){
      if(kind === "straight") return 0;
      const sign = kind === "left" ? -1 : 1;
      if(kind === "round"){
        return sign * (0.12 + exitProgress * 0.2);
      }
      const enter = Math.max(0, Math.min(1, (progress - 0.72) / 0.18));
      const exit = Math.max(enter, exitProgress);
      return sign * exit * 0.22;
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const path = this.buildStablePath(this.activeRoute.kind, width, height);
      const pathWithFuture = this.appendFuturePath(path, width, height);
      const displayPoints = this.getDisplayPath(pathWithFuture);
      const carPoint = {x:width * 0.5, y:height - 14};
      const carIndex = this.findClosestPointIndex(displayPoints, carPoint.x, carPoint.y);

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height);

      ctx.save();
      ctx.translate(carPoint.x, carPoint.y);
      ctx.rotate(this.renderState.cameraAngle);
      ctx.translate(-carPoint.x, -carPoint.y);

      this.drawRouteGlow(ctx, displayPoints);
      this.drawRouteBase(ctx, displayPoints);
      this.drawDrivenTrail(ctx, displayPoints, carIndex);
      this.drawManeuverMarker(ctx, path, time);
      ctx.restore();

      this.drawCar(ctx, carPoint, time);
    }

    buildStablePath(kind, width, height){
      const cx = width * 0.5;
      const carY = height - 14;
      const points = [];
      const shiftY = this.getApproachShift(height);
      const turnY = carY - 18 + shiftY;
      const laneOffset = Math.min(20, width * 0.18);
      const futureLength = Math.max(34, height * 0.44);

      const addLine = (x1, y1, x2, y2, segments = 14) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          points.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuadratic = (x1, y1, cx1, cy1, x2, y2, segments = 20) => {
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
        const exitX = cx - laneOffset * 2.4;
        const exitY = turnY - futureLength;
        addLine(cx, carY + 14, cx, turnY + 14, 18);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 18);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
      }else if(kind === "right"){
        const bendX = cx + laneOffset;
        const exitX = cx + laneOffset * 2.4;
        const exitY = turnY - futureLength;
        addLine(cx, carY + 14, cx, turnY + 14, 18);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 18);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
      }else if(kind === "round"){
        const radius = Math.min(12, width * 0.14);
        const exitX = cx + radius * 2;
        const exitY = turnY - futureLength * 0.85;
        addLine(cx, carY + 14, cx, turnY + radius + 12, 16);
        for(let i = 0; i <= 26; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.18 * (i / 26));
          points.push({
            x:cx + Math.cos(angle) * radius,
            y:turnY + Math.sin(angle) * radius
          });
        }
        addLine(cx + radius, turnY, exitX, exitY, 14);
      }else{
        addLine(cx, carY + 14, cx, -24, 30);
      }

      return {
        points,
        kind,
        turnAnchor:this.getPointAt(points, kind === "straight" ? 0.72 : 0.58)
      };
    }

    getApproachShift(height){
      const farShift = -height * 0.78;
      const approachT = Math.min(1, this.renderState.progress / 0.88);
      const enterShift = this.lerp(farShift, 0, Math.pow(approachT, 0.94));
      if(this.renderState.progress < 0.88){
        return enterShift;
      }
      return this.lerp(0, height * 0.34, this.renderState.exitProgress);
    }

    appendFuturePath(path, width, height){
      const result = path.points.map(point => ({...point}));
      const last = result[result.length - 1];
      if(!last) return result;

      const top = -18;
      const futureKind = this.pendingRoute ? this.pendingRoute.kind : "straight";
      const carry = Math.min(14, width * 0.13);

      const addLine = (x1, y1, x2, y2, segments = 8) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          result.push({
            x:this.lerp(x1, x2, t),
            y:this.lerp(y1, y2, t)
          });
        }
      };

      const addQuadratic = (x1, y1, cx1, cy1, x2, y2, segments = 10) => {
        for(let i = 1; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          result.push({
            x:mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y:mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      const leadX = last.x;
      const leadY = last.y - height * 0.16;
      addLine(last.x, last.y, leadX, leadY, 8);

      if(futureKind === "left"){
        addQuadratic(leadX, leadY, leadX, leadY - 6, leadX - carry, leadY - 6, 10);
        addLine(leadX - carry, leadY - 6, leadX - carry * 1.8, top, 8);
      }else if(futureKind === "right"){
        addQuadratic(leadX, leadY, leadX, leadY - 6, leadX + carry, leadY - 6, 10);
        addLine(leadX + carry, leadY - 6, leadX + carry * 1.8, top, 8);
      }else if(futureKind === "round"){
        const radius = Math.min(7, width * 0.08);
        for(let i = 1; i <= 12; i++){
          const angle = Math.PI * 0.62 + (Math.PI * 1.04 * (i / 12));
          result.push({
            x:leadX + Math.cos(angle) * radius,
            y:leadY + Math.sin(angle) * radius
          });
        }
        addLine(leadX + radius, leadY, leadX + radius * 1.7, top, 6);
      }else{
        addLine(leadX, leadY, leadX, top, 10);
      }

      return result;
    }

    getDisplayPath(targetPoints){
      const sampledTarget = this.samplePoints(targetPoints, 72);
      if(!this.previousPath || this.renderState.transitionT >= 1){
        this.displayPath = sampledTarget;
        this.previousPath = sampledTarget;
        return sampledTarget;
      }

      const sampledFrom = this.samplePoints(this.previousPath, sampledTarget.length);
      const eased = 1 - Math.pow(1 - this.renderState.transitionT, 3);
      const blended = sampledTarget.map((point, index) => ({
        x:this.lerp(sampledFrom[index].x, point.x, eased),
        y:this.lerp(sampledFrom[index].y, point.y, eased)
      }));

      this.displayPath = blended;
      if(this.renderState.transitionT >= 0.999){
        this.previousPath = sampledTarget;
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

    drawManeuverMarker(ctx, path, time){
      if(path.kind === "straight") return;
      const pulse = 0.5 + Math.sin(this.renderState.pulse * 1.8 + time * 0.6) * 0.5;
      const anchor = path.turnAnchor;

      ctx.save();
      ctx.globalAlpha = 0.15 + pulse * 0.06;
      ctx.fillStyle = "#6fd3ff";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 7 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#6fd3ff";
      ctx.lineWidth = 1.4;

      if(path.kind === "left" || path.kind === "right"){
        const dir = path.kind === "left" ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(anchor.x - dir * 3, anchor.y);
        ctx.lineTo(anchor.x + dir * 5, anchor.y);
        ctx.stroke();
      }else if(path.kind === "round"){
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
