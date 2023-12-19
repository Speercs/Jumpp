'use strict';

let Elements = require('units_worm_elements');
let RoomCallback = require('util_roomCallback');


const Spin = {
  UNKNOWN: 'unknown',
  CW: 'cw',
  CCW: 'ccw',
}

const Task = {
  GUARD_POSITION: 'guard_position',
}

class Quad {
  constructor(quadName) {
      if (!Memory.quads) {
        Memory.quads = {};
      }

      if (!Game.quads) {
        Game.quads = {};
      }

      if (!Memory.quads[quadName]) {
        throw `No such quad: ${quadName}`;
      }

      if (!Game.quads[quadName]) {
        Game.quads[quadName] = this;
      }

      this.name = quadName;
      this.memory = Memory.quads[quadName];

      this.creeps = _.map(this.memory.ids, Game.getObjectById);

      if (this.creeps.length != 4) {
        let message = `Weird number of creeps (${this.creeps.length}) in quad.`;
        console.log(message);
        throw message;
      }

      this.validCreeps = _.compact(this.creeps);

      if (!(this.validCreeps.length >= 0) && !(this.validCreeps.length <= 4)) {
        let message = `Weird number of validCreeps (${this.validCreeps.length}) in quad.`;
        console.log(message);
        throw message;
      }

      this.deriveState();
  };

  static create(creeps) {
    if (!creeps instanceof Array ||
        creeps.length == 0 ||
        creeps.length > 4) {
      console.log(`Bad input to Quad.create()`);
      throw ERR_INVALID_ARGS;
    }

    let cantQuad = _.filter(creeps, c => !c.canQuad());
    if (cantQuad.length) {
      console.log(`Failed to create quad. Some creeps (${_.map(cantQuad, 'name')}) cannot join quads.`);
      throw ERR_INVALID_ARGS;
    }

    let ids = _.map(creeps, obj => obj && obj instanceof Creep && obj.id || undefined);
    let reconstitutedCreeps = _.map(ids, Game.getObjectById);
    let validCreeps = _.compact(reconstitutedCreeps);
    if (validCreeps.length == 0) {
      console.log(`Failed Quad.create(). No valid creeps.`);
      throw ERR_INVALID_ARGS;
    }

    let newQuadName = getQuadName();

    if (global[newQuadName]) {
      console.log(`Failed to create quad. Name ${newQuadName} is already a global. This should never happen.`);
      throw ERR_FAILED_PRECONDITION;
    }

    console.log(`Creating new quad [${_.map(reconstitutedCreeps, 'name')}] and name ${newQuadName}`);
    Memory.quads[newQuadName] = {desiredFacing: TOP_LEFT, desiredSpin: Spin.CW, ids};
    for (let creep of validCreeps) {
      creep.memory.state = STATE_APPENDAGE;
      creep.memory.quad = newQuadName;
    }
    return OK;
  }

  static updateAll() {
    if (!Memory.quads) Memory.quads = {};

    for (let key of _.keys(Memory.quads)) {
      let quad = new Quad(key);
      if (quad.validCreeps.length) {
        global[key] = quad;
        quad.update();
      } else {
        quad.logError(`No members remain. Deleting.`);
        global[key] = undefined;
        delete Memory.quads[key];
      }
    }
  }

  static reset() {
    for (let key of _.keys(Memory.quads)) {
      global[key] = undefined;
    }
    Memory.quads = {};
    return OK;
  }

  defendPosition(goal, range) {
    if (!goal instanceof RoomPosition) {
      let error = `Quad.defendPosition: Invalid goal ${goal}`;
      this.logError(error);
      throw error;
    }

    if (!_.isNumber(range) || range < 1) {
      let error = `Quad.defendPosition: Invalid range ${range}`;
      this.logError(error);
      throw error;
    }

    let taskType = Task.GUARD_POSITION;

    this.memory.task = {taskType, goal, range};
    return OK;
  }

  deriveState() {
    if (this.validCreeps.length == 0) {
      this.pos = undefined;
      this.room = undefined;
      this.worldPos = undefined;
      this.pos1 = undefined;
      this.worldPos1 = undefined;
      this.facing = undefined;
      this.coherent = false;
      this.oriented = false;
      this.spin = Spin.UNKNOWN;
      return;
    } else if (this.validCreeps.length == 1) {
      this.pos = this.validCreeps[0].pos;
      this.room = this.validCreeps[0].room;
      this.worldPos = WorldPosition.fromRoomPosition(this.pos);
      this.pos1 = this.pos;
      this.worldPos1 = this.worldPos;
      this.facing = TOP_LEFT;
      this.coherent = true;
      this.oriented = true;
      this.spin = Spin.CW;
      return;
    }

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let creep of this.validCreeps) {
      x0 = Math.min(x0, creep.worldPos.x);
      x1 = Math.max(x1, creep.worldPos.x);
      y0 = Math.min(y0, creep.worldPos.y);
      y1 = Math.max(y1, creep.worldPos.y);
    }

    this.worldPos = new WorldPosition(x0, y0);
    this.pos = this.worldPos.toRoomPosition();
    this.worldPos1 = new WorldPosition(x1, y1);
    this.pos1 = this.worldPos1.toRoomPosition();
    this.room = this.validCreeps[0].room;

    if ((x1 - x0 > 1) || (y1 - y0 > 1)) {
      this.coherent = false;
      this.oriented = false;
      this.spin = Spin.UNKNOWN;
      return;
    }

    this.coherent = true;

    let indexes = _.map(this.creeps, c => (c && c instanceof Creep) ? this.positionIndex(c.worldPos) : -1);
    let isCw = true;
    let isCcw = true;

    for (let i = 0; i < 4; i++ ) {
      let p = (i+3) & 0x3;
      if (indexes[i] >= 0 && indexes[p] >= 0) {
        if (indexes[i] != ((indexes[p] + 1) & 3)) {
          isCw = false;
        }
        if (indexes[i] != ((indexes[p] + 3) & 3)) {
          isCcw = false;
        }
      }
    }

    if (isCw) {
      this.spin = Spin.CW;
    } else if (isCcw) {
      this.spin = Spin.CCW;
    } else {
      this.spin = Spin.UNKNOWN;
      this.oriented = false;
      this.facing = undefined;
    }

    if (this.spin != Spin.UNKNOWN) {
      let indexOfFirstValidCreep = _.findIndex(this.creeps);
      let posOfFirstValidCreep = indexes[indexOfFirstValidCreep];
      let base = posOfFirstValidCreep + 4;
      base += isCw ? -indexOfFirstValidCreep : indexOfFirstValidCreep;
      let index = base & 0x3;
      this.facing = [8,2,4,6][index];
      this.oriented = this.facing == this.memory.desiredFacing;
    }
  }

  positionIndex(worldPos) {
    if (worldPos.x == this.worldPos.x) {
      if (worldPos.y == this.worldPos.y) {
        return 0;
      } else if (worldPos.y == this.worldPos.y + 1 ) {
        return 3;
      }
    } else if (worldPos.x == this.worldPos.x + 1 ) {
      if (worldPos.y == this.worldPos.y) {
        return 1;
      } else if (worldPos.y == this.worldPos.y + 1 ) {
        return 2;
      }
    }
    return -1;
  }

  update() {
    // Do this first. Don't want any errors to make us skip it.
    for (let creep of this.validCreeps) {
      creep._quadRan = Game.time;
    }

    for (let creep of this.validCreeps) {
      let head = creep.pos;
      let index = _.indexOf(this.creeps, creep);
      let visual = new RoomVisual(head.roomName);
      visual.text(`${index}`, head.x, head.y + 0.25, {color:'blue'});

      if (creep.hasParts(ATTACK)) {
        Elements.doHitterActions(creep);
      }

      if (creep.hasParts(RANGED_ATTACK)) {
        Elements.doShooterActions(creep);
      }

      if (creep.hasParts(HEAL)) {
        Elements.doHealerActions(creep);
      }
    }
    if (this.memory.task) {
      switch (this.memory.task.taskType) {
        case Task.GUARD_POSITION:
          this.doGuardPosition();
          break;
        default:
          break;
      }
    } else {
      let flag = Game.flags[this.name];
      if (flag && this.coherent && this.oriented && !flag.pos.isEqualTo(this.pos)) {
        this.march(flag.pos);
      } else {
        this.cohere();
      }
    }

  }

  /**
   * Move to (RoomPosition) memory.task.goal
   * Destroy any enemy units within memory.task.range steps of the goal.
   * If there aren't any, stay between the goal and the enemy unit nearest
   * to it, while keeping all elements of the quad within memory.task.range steps of the goal.
   */
  doGuardPosition() {
    let range = this.memory.task.range || 0;
    let goal = new RoomPosition(this.memory.task.goal.x,
        this.memory.task.goal.y,
        this.memory.task.goal.roomName);
    if (!goal instanceof RoomPosition) {
      this.logError(`quad with task GUARD_POSITION has invalid goal.`);
      return;
    }
    let goalWorldPos = WorldPosition.fromRoomPosition(goal);

    if (!this.coherent || !this.oriented) {
      this.logError(`Not oriented. Forming up.`);
      this.cohere();
      return;
    }

    let touchContactWithAnyEnemy = false;

    // If there's a nearby enemy and our facing isn't favorable, turn to face it.
    let enemy = this.mostUrgentEnemy();
    if (enemy) {
      let elementNearestEnemy = _.min(this.validCreeps, c => c.pos.getCartesianDistanceSquared(enemy.pos));
      let enemyd2 = elementNearestEnemy.worldPos.getCartesianDistanceSquared(enemy.worldPos);
      if (enemyd2 < 16 && enemyd2 > 0) {
        let bearing = normalizedFacing(elementNearestEnemy.pos.getDirectionTo(enemy.pos));
        if (bearing != this.facing) {
          //this.logError(`Enemy at ${enemy.pos}. Turning to ${bearing} to face it.`);
          this.setFacing(bearing);
          this.cohere();
          return;
        }
      }

      // If there's an enemy within 'range' of the goal, and we aren't already in touch range, 
      // close with the enemy.
      let enemyGoalD2 = enemy.worldPos.getCartesianDistanceSquared(goalWorldPos);
      let enemyLinearDistance = enemy.worldPos.getLinearDistance(elementNearestEnemy);
      if (enemyLinearDistance == 1) touchContactWithAnyEnemy = true;
      if (enemyGoalD2 <= range*range && enemyLinearDistance > 1) {
        //this.logError(`Closing with enemy that's too close to goal.`);
        this.march(enemy.pos, {range:1})
        return;
      }
    }


    // If we aren't in range of the goal, close with it.
    if (!this.isWithinRange(goal, range)) {
      //this.logError(`Too far from goal. Closing.`);
      this.march(goal, {range: Math.max(range-1, 0)});
    }

    function getEnemyInterceptPos() {
      let enemyWorldPos = WorldPosition.fromRoomPosition(enemy.pos);
      let dx = enemyWorldPos.x - goalWorldPos.x;
      let dy = enemyWorldPos.y - goalWorldPos.y;
      let d2 = dx*dx + dy*dy;
      if (d2 <= range*range) return enemy.pos;

      let d = Math.sqrt(d2);
      let ndx = dx / d;
      let ndy = dy / d;

      let centerx = goalWorldPos.x - 0.5 + ndx * range;
      let centery = goalWorldPos.y - 0.5 + ndy * range;

      let tx = Math.round(centerx);
      let ty = Math.round(centery);

      return new WorldPosition(tx,ty).toRoomPosition();
    }

    // If we're responding to an enemy, be on a point that lines 'range' steps on a line from
    // the goal to it, or at its position if it's nearer that than.
    // TODO: Don't try to close if we're already in touch contact.
    if (enemy && !touchContactWithAnyEnemy) {
      let desiredPos = getEnemyInterceptPos(enemy);
      if (!this.pos.isEqualTo(desiredPos)) {
        //this.logError(`Enemy at ${enemy.pos}. Moving to ${desiredPos} to intercept it.`);
        this.march(desiredPos);
      }
    }
  }

  isWithinRange(goal, range) {
    // Check linear distance from quad's home.
    let linearDistance = this.pos.getRangeTo(goal);
    if (linearDistance > range) return false;

    // Check linear distance from all elements.
    if (!_(this.validCreeps).all(c => c.pos.inRangeTo(goal, range))) {
      return false;
    }

    // TODO: Check steps from quad's home.

    return true;
  }

  mostUrgentEnemy() {
    if (this.memory.enemy) return Game.getObjectById(this.memory.enemy);
  }

  move(dir) {
    for (let creep of this.validCreeps) {
      creep.move(dir);
    }
    return OK;
  }

  setEnemy(creep) {
    if (creep && creep.id) {
      this.memory.enemy = creep.id;
      return OK;
    }

    return ERR_INVALID_ARGS;
  }

  /**
   * Move as a unit toward destination. Valid only when the quad is coherent. Valid even when the
   * quad isn't oriented.
   */
  march(destination, options) {
    let defaultOptions = {
      roomCallback: RoomCallback.quadCallback,
      range: 0,
  };

  let mergedOptions = _.merge(defaultOptions, options);

  if (destination instanceof WorldPosition) destination = destination.toRoomPosition();
    if (!destination instanceof RoomPosition) return ERR_INVALID_ARGS;
    if (!this.coherent) return ERR_INVALID_ARGS;
    if (this.fatigue) return ERR_FAILED_PRECONDITION;

    return Traveler.travelTo(this, destination, mergedOptions);
  }

  setFacing(dir) {
    this.memory.desiredFacing = normalizedFacing(dir);
  }

  setSpin(spin) {
    if (![Spin.CW, Spin.CCW].includes(spin)) return ERR_INVALID_ARGS;
    this.memory.desiredSpin = spin;
    return OK;
  }

  /**
   * Move all the creeps such that the quad arranges itself in formation at worldPos.
   * if worldPos isn't supplied, use the current top-left of the quad.
   */
  cohere(callerPos) {
    let worldPos = callerPos || this.worldPos;
    if (worldPos instanceof RoomPosition) worldPos = WorldPosition.fromRoomPosition(worldPos);

    let hostileCreeps = _.cloneDeep(this.room.hostileCreeps);

    if (this.memory.enemy) {
      let enemy = Game.getObjectById(this.memory.enemy);
      if (this.memory.enemy) hostileCreeps.push(enemy);
    }

    // Special case: If we have four elements and our rectangle is tight (3x3 or smaller) and
    // there are hostiles in it, maybe take special measures.
    if (!this.coherent &&
        !this.callerPos &&
        hostileCreeps.length &&
        (this.pos.roomName == this.pos1.roomName) &&
        this.pos1.x <= this.pos.x + 2 &&
        this.pos1.y <= this.pos.y + 2) {
      let obstacles = _.filter(hostileCreeps,
        c => c.pos.x >= this.pos.x &&
            c.pos.x <= this.pos1.x &&
            c.pos.y >= this.pos.y &&
            c.pos.y <= this.pos1.y);
      if (obstacles.length) {
        //this.logError(`Looking for a way to reform around hostiles ${_.map(obstacles, 'name')}`)
        // look for a good opportunity to group up. Search for a 2x2 rectangle such that:
        // -- all four of our elements can reach it, and
        // -- no enemy are presently inside it.
        let found = false;
        for (let y = this.pos.y - 1; !found && y <= this.pos1.y; y++) {
          if (y <= 0 || y >= 49) continue;
          for (let x = this.pos.x - 1; !found && x <= this.pos1.x; x++) {
            if (x <= 0 || x >= 49) continue;
            if (_.any(obstacles, o => o.pos.x >= x && o.pos.x <= x + 1 && o.pos.y >= y && o.pos.y <= y + 1)) continue;
            if (_.any(this.validCreeps, c => (c.pos.x < x - 1) || (c.pos.x > x + 2) || (c.pos.y < y - 1) || (c.pos.y > y + 2))) continue;
            //this.logError(`I think we can reform at (${x}, ${y})}`)
            worldPos = WorldPosition.fromRoomPosition(new RoomPosition(x, y, this.pos.roomName));
            found = true;
          }
        }
      }
    }

    let rawPositions = [worldPos,
        worldPos.oneStep(RIGHT),
        worldPos.oneStep(BOTTOM_RIGHT),
        worldPos.oneStep(BOTTOM)];
    let adjustment = this.memory.desiredSpin == Spin.CW ? 1 : 3;

    let posIndex = [-1,-1,1,-1,2,-1,3,-1,0][this.memory.desiredFacing];
    for (let index = 0; index < 4; index++) {
      if (this.creeps[index]) {
        let roomPos = rawPositions[posIndex].toRoomPosition();
        //this.creeps[index].logError(`(element ${index}) with posIndex=${posIndex} trying to move to ${roomPos}`);
        this.creeps[index].destination = roomPos;
        this.creeps[index].travelTo2(
            roomPos,
            {range:0});
      }
      posIndex = (posIndex + adjustment) & 0x3;
    }

    // Creeps could get tangled if one is on his final pos and he's blocking another whose final pos
    // is on the other side. So: If a creep isn't trying to move, and at least one other creep is trying
    // to move onto its position, have it move toward the final destination of one of the onrushing creeps.
    for (let creep of this.validCreeps) {
      if (!creep.pos.isEqualTo(creep.nextPos)) continue;

      for (let otherCreep of this.validCreeps) {
        if (creep == otherCreep) continue;
        if (!creep.pos.isEqualTo(otherCreep.nextPos)) continue;
        creep.travelTo2(otherCreep.destination, {range:0});
        break;
      }
    }

    return OK;
  }

  logDebug(text) {
    this.memory.logDebug = text;
    if (this.memory.debug) {
      console.log(`${this && this.pos && this.pos.link} ${this.name}: ${text}`);
    }
  }
  
  logError(text) {
    this.memory.logError = text;
    console.log(`${this && this.pos && this.pos.link} ${this.name}: ${text}`);
  }
}

Object.defineProperty(Quad.prototype, 'fatigue', {
  get: function() {
    if (this._fatigue) return this._fatigue;

    return this._fatigue = _.max(this.validCreeps, 'fatigue').fatigue;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function getQuadName() {
  let nextIndex = _(Memory.quads)
      .keys()
      .push(`quad0`)
      .filter(s => _.startsWith(s, 'quad'))
      .map(s => parseInt(s.substring(4))).max() || 0 + 1;

  return `quad` + nextIndex;
}

function normalizedFacing(dir) {
  switch (dir) {
    case TOP_LEFT:
    case TOP:
      return TOP_LEFT;
    case TOP_RIGHT:
    case RIGHT:
      return TOP_RIGHT;
    case BOTTOM_RIGHT:
    case BOTTOM:
      return BOTTOM_RIGHT;
    case BOTTOM_LEFT:
    case LEFT:
      return BOTTOM_LEFT;
    default:
      throw `normalizedFacing: Invalid dir ${dir}`;
  }
}

// temp!
global.mats = function() {
  return _(Game.rooms.E28N38.myCreeps)
      .filter(c => c.memory.role == 'alfa' || c.memory.role == 'nurse')
      .sortBy('name')
      .filter(c => c.memory.model == 10)
      .value();
}

global.Quad = Quad;