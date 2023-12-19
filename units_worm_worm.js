'use strict';

let Elements = require('units_worm_elements');
let EventLog = require('util_event_log');
let Healer = require('role_healer');
let Nav = require('util_nav');
let Otacon = require('units_worm_otacon');
let Sister = require('role_sister');
let SpawnJob = require('util_spawnJob');
let Wrecker = require('role_wrecker');

const State = {
  COUNTDOWN: 'countdown',
  SPAWN: 'spawn',
  MUSTER: 'muster',
  SIT: 'sit',
  TRAVEL: 'travel',
  CROSS: 'cross',
  REVERSE: 'reverse',
  ABORT: 'abort',
  DONE: 'done'
}

const Formation = {
  HEALER_FIRST: 'healer_first',
  WRECKER_FIRST: 'wrecker_first'
}

const SORT_ORDER = {
  healer_first: {'healer':0, 'wrecker':1, 'sister':2},
  wrecker_first: {'wrecker':0, 'healer':1, 'sister':2}
}

function sortedElements(id) {
  if (!Game.units[id]) {
    return [];
  }
  let elements = (Game.units[id] && Game.units[id].elements) || [];
  let sortOrder = SORT_ORDER[Memory.worms[id].formation];
  return _.sortBy(elements, c => sortOrder[c.memory.role]);
}

function calculateIsConnected(elements) {
  if (elements.length < 2) {
    return true;
  }

  for (let i=1; i < elements.length; i++) {
    if (elements[i-1].pos.getGlobalRangeTo(elements[i].pos) > 1) {
      return false;
    }
  }

  return true;
}

function calculateIsSlotted(id, elements) {
  let wormTarget = Otacon.wormTarget(id);

  if (!wormTarget) {
    return;
  }

  let normal = wormTarget.normal;

  if (!normal) {
    return;
  }

  for (let i=0; i < elements.length; i++) {
    if (wormTarget.isEqualTo(elements[i].pos)) {
      elements[i].isSlotted = true;
    } else if (wormTarget.getExactDirectionTo(elements[i].pos) == normal) {
      elements[i].isSlotted = true;
    }
  }

  return _.all(elements, 'isSlotted');
}

function preUpdate(id) {
  let myElements = sortedElements(id);
  Memory.worms[id].creeps = _.map(myElements, 'id');
  let isConnected = calculateIsConnected(myElements);
  Memory.worms[id].isConnected = isConnected;

  let isSlotted = calculateIsSlotted(id, myElements);
  Memory.worms[id].isSlotted = isSlotted;
}

function update(id) {
  let mem = Memory.worms[id];
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  let myElements = _.map(Memory.worms[id].creeps, Game.getObjectById);

  function logDebug(message) {
    if (Memory.worms[id].debug) {
      logError(message);
    }
  }
  
  function logError(message) {
    console.log(id + ': ' + message);
  }

  function logEvent(message) {
    EventLog.writeEntry(EventLog.WORM, mem.targetRoom, `${id}: ${message}`);
  }
  
  function setState(state) {
    mem.state = state;
    mem.subState = 0;
    repeat = true;
  }
  
  function creepTravelTo(creep, target) {
    try {
      creep.travelTo2(
        target, {
          allowSK: true,
          ignoreCreeps: true,
          ignoreRoads: true,
          range: 0});
    } catch (err) {
      logError(`Error in creep.travelTo2: ${err}`);
    }
  }

  function doCountdown() {
    if (Memory.rooms[mem.targetRoom].safemodeEnd > Game.time && !mem.safemodeOk) {
      logError(`Canceling ${id}, targetRoom ${mem.targetRoom} in safemode.`);
      setState(State.ABORT);
      return;
    }

    if (mem.spawnTime > Game.time) {
      logDebug(`Counting down. ${mem.spawnTime - Game.time} ticks util spawn.`);
      return;
    }

    let other = _.find(
      Memory.worms,
      w => (w.state == State.SPAWN || w.state == State.MUSTER) &&
         w.sourceRoom == mem.sourceRoom);

    if (other) {
      logDebug(`Holding while ${other.id} spawns.`);
      return;
    }

    logDebug(`Clear to spawn. Spawning.`);
    setState(State.SPAWN);
  }

  function doSpawn() {
    // Spawn elements.
    const roles = {healer: Healer, wrecker: Wrecker, sister: Sister};
    function spawnElement(role, model) {
      let rooms = [mem.sourceRoom];
      if (roles[role].requestSpawnUnit(rooms, model, id, SpawnJob.PRIORITY_UNIT) == OK) {
        logDebug(`Spawning ${role}`);
      } else {
        logError(`Failed to spawn ${role}`);
      }
    }

    let myElementsByRole = _.groupBy(myElements, 'memory.role');

    if (mem.composition.wrecker && !myElementsByRole.wrecker) {
      spawnElement('wrecker', mem.composition.wrecker);
    }
    if (mem.composition.healer && !myElementsByRole.healer) {
      spawnElement('healer', mem.composition.healer);
    }
    if (mem.composition.sister && !myElementsByRole.sister) {
      spawnElement('sister', mem.composition.sister);
    }

    let numSpawned = _.filter(myElements, 'ticksToLive').length;
    let numSpawning = myElements.length - numSpawned;

    // Unlock spawns.
    let expectedElements = _.keys(mem.composition).length;
    if (numSpawning == expectedElements ) {
      let spawns = _.map(myElements, c => Game.spawns[c.memory.spawnedBy]);
      if (!_.any(spawns, 'spawning.remainingTime')) {
        _.forEach(myElements, c => delete c.memory.holdSpawn);
      }
    }

    // Transition.
    if (numSpawned == expectedElements) {
      setState(State.MUSTER);
      _.forEach(myElements, e => e.notifyWhenAttacked(false));
    }
  }

  function creepInReasonableMusterPosition(creep) {
    if (creep.pos.roomName == Memory.worms[id].sourceRoom) {
      let nearestLab = creep.pos.findClosestByRange(creep.room.labs);
      let nearestLabDistance = creep.pos.getRangeTo(nearestLab);
  
      return creep.pos.tileType == TILE_EXTERIOR && nearestLabDistance > 3;
    } else {
      return creep.pos.x > 2 && creep.pos.x < 47 && creep.pos.y > 2 && creep.pos.y < 47;
    }
  }

  function doMuster() {
    let expectedElements = _.keys(mem.composition).length;
    if (myElements.length < expectedElements) {
      setState(State.ABORT);
      return;
    }

    let appendages = _.filter(myElements, c => c.memory.state == STATE_APPENDAGE);

    if (!appendages.length) {
      return;
    }

    // TODO: The tailing units derp around the base a bit. Have them do something smarter.
    for (let i = 0; i < appendages.length; i++) {
      let creepTarget = i ? appendages[i-1] : Otacon.wormTarget(id);

      if (!i && creepInReasonableMusterPosition(appendages[0])) {
        continue;
      }

      creepTravelTo(appendages[i], creepTarget);
    }

    if (appendages.length == expectedElements && mem.isConnected) {
      setState(State.TRAVEL);
    }
  }

  /**
   * Moves the healer/beater pair in some special cases. Returns true if it wants to handle the
   * movement.
   * */
  function doBeaterModeMovement() {
    let myBeater = myElements[0];
    let myHealer = myElements[1];

    if (myHealer.fatigue && myBeater.fatigue) {
      return true;
    }

    let nearbyEnemies = myBeater.pos.findInRange(myBeater.room.hostileCreeps, 3);

    if (myHealer.fatigue) {
      // Only the beater can move.
      // TODO: Improve this.
      return;
    } else if (myBeater.fatigue) {
      // Only the healer can move.
      // TODO: Improve this.
    } else {
      // Both can move.
      // If there's a beater within 2 of the healer, move the beater onto the healer and the
      // healer directly away from the beater.
      let beaterNearHealer =
        myHealer.pos.findInRange(nearbyEnemies, 2, {filter: c => c.hasParts(ATTACK)})[0];

      if (beaterNearHealer) {
        let beaterDir = myHealer.pos.getDirectionTo(beaterNearHealer);
        creepTravelTo(myBeater, myHealer.pos);
        creepTravelTo(myHealer, myHealer.pos.oneStep(Nav.oppositeDirection(beaterDir)));
        return true;
      }

      // If there's a ramparted beater within 2 of the beater, move everyone directly away from it.
      let rampartedBeaterNearBeater =
        myBeater.pos.findInRange(
          nearbyEnemies, 2, {filter: c => c.hasParts(ATTACK) && !c.naked})[0];

      if (rampartedBeaterNearBeater && !myHealer.pos.nearEdge) {
        let beaterDir = myBeater.pos.getDirectionTo(rampartedBeaterNearBeater);
        let moveDir = Nav.oppositeDirection(beaterDir);
        creepTravelTo(myBeater, myBeater.pos.oneStep(moveDir));
        creepTravelTo(myHealer, myHealer.pos.oneStep(moveDir));
        return true;
      }
    }
  }

  function rampartsWithinOne(pos) {
    return pos.findInRange(Game.rooms[pos.roomName].ramparts, 1);
  }

  function adjacentPositions(pos) {
    let results = [];

    for (let i=1; i <=8; i++) {
      results.push(pos.oneStep(i));
    }

    return results;
  }

  function doEdgeModeMovement() {
    let myHead = myElements[0];
    let myTail = myElements[1];

    // Kludge!
    if (myHead.nearEdge && myTail.onEdge) {
      myHead.moveTo(myHead.pos.oneStep(3));
      myTail.moveTo(myHead.pos);
    }
    return;
  }

  /**
   * Moves a lone healer in some special cases. Returns true if it wants to handle the movement.
   * */
  function doLoneHealerMovement() {
    let myHealer = myElements[0];

    let desiredPosition = Otacon.wormTarget(id);

    if (desiredPosition.normal) {
      myHealer.moveTo(desiredPosition.oneStep(desiredPosition.normal));
      return true;
    }
  }

  /**
   * Moves a lone skirmisher (healer/shooter).
   */
  function doLoneSkirmisherMovement() {
    let me = myElements[0];

    let desiredPosition = Otacon.wormTarget(id);
    creepTravelTo(me, desiredPosition);
    return true;
  }

  function doSlottedSniperModeMovement() {
    let myShooter = myElements[0];
    let myHealer = myElements[1];

    if (myHealer.fatigue && myShooter.fatigue) {
      return true;
    }

    let desiredPosition = Otacon.wormTarget(id);

    let normal = desiredPosition.normal;
    let antinormal = Nav.oppositeDirection(normal);

    let nearbyEnemies = myShooter.pos.findInRange(myShooter.room.hostileCreeps, 3);
    let nearbyHitters = _.filter(nearbyEnemies, c => c.attackPower > 1000);

    let numStepsAway = myShooter.pos.getRangeTo(desiredPosition);
    
    // Retreat if our (head) position is threatened by a hitter and the spot behind it is not.
    if (numStepsAway < 3) {
      let threatsHere = false;
      let threatsBehind = false;

      _.forEach(nearbyHitters, function(c) {
        let distToHere = c.pos.getRangeTo(myShooter.pos);
        if (distToHere == 1 || (distToHere == 2 && !c.fatigue)) {
          threatsHere = true;
        }
        let distToBehind = c.pos.getRangeTo(myHealer.pos);
        if (distToBehind == 1 || (distToBehind == 2 && !c.fatigue)) {
          threatsBehind = true;
        }
      });

      if(threatsHere && !threatsBehind) {
        myShooter.moveTo(myHealer.pos);
        myHealer.moveTo(myHealer.pos.oneStep(normal));
        return true;
      }
    }

    // Advance if we're not at the wall and the position ahead isn't threatened by a hitter.
    if (numStepsAway) {
      let positionAhead = myShooter.pos.oneStep(antinormal);
      let hittersRelevantAhead = positionAhead.findInRange(nearbyHitters, 2);
      let hittersAdjacentAhead = positionAhead.findInRange(hittersRelevantAhead, 1);
      let hittersThreateningAhead = _.any(hittersAdjacentAhead) ||
        _.any(hittersRelevantAhead, c => !c.fatigue);

      if (!hittersThreateningAhead) {
        myShooter.moveTo(positionAhead);
        myHealer.moveTo(myShooter.pos);
        return true;
      }

      // stay put. Position ahead is threatened.
      return true;
    }

  }

  /**
   * Moves the healer/shooter pair in some special cases. Returns true if it wants to handle the
   * movement.
   * */
  function doSniperModeMovement() {
    if (mem.isSlotted) {
      return doSlottedSniperModeMovement();
    }

    let myShooter = myElements[0];
    let myHealer = myElements[1];

    if (myHealer.fatigue && myShooter.fatigue) {
      return true;
    }

    let nearbyEnemies = myShooter.pos.findInRange(myShooter.room.hostileCreeps, 3);

    if (myHealer.fatigue) {
      // Only the beater can move.
      // TODO: Improve this.
      return;
    } else if (myShooter.fatigue) {
      // Only the healer can move.
      // TODO: Improve this.
    } else {
      // Both can move.
      // If the sniper is inside a rampart, nobody move.
      if (!myShooter.naked) {
        return true;
      }

      // If there's a beater within 2 of the shooter, or a ramparted shooter within 3, and
      // the pair can retreat (both along the shooter-to-healer direction) without hitting
      // the room edge, go.
      let beaterNearShooter =
        myShooter.pos.findInRange(nearbyEnemies, 2, {filter: c => c.hasParts(ATTACK)})[0];

      let rampartedShooterNearShooter =
        myShooter.pos.findInRange(nearbyEnemies, 0, {filter: c => c.hasParts(RANGED_ATTACK) && !c.naked})[0];
      if (beaterNearShooter || rampartedShooterNearShooter) {
        let retreatDir = myShooter.pos.getDirectionTo(myHealer);
        let newHealerPos = myHealer.pos.oneStep(retreatDir);

        if (newHealerPos.open && !newHealerPos.onEdge) {
          creepTravelTo(myShooter, myHealer.pos);
          creepTravelTo(myHealer, newHealerPos);
          return true;
        }
      }

      // If the healer is next to a rampart and there's a space to which it could move that
      // is still in touch-range of the shooter but not next to a rampart, move.
      let rampartsNearHealer = rampartsWithinOne(myHealer.pos);
      if (rampartsNearHealer.length) {
        let newPosition = _.find(
          adjacentPositions(myHealer.pos),
          p => p.isNearTo(myShooter) && rampartsWithinOne(p).length == 0);

        if (newPosition) {
          creepTravelTo(myHealer, newPosition);
          return true;
        }
      }
    }
  }

  /**
   * Moves the healer/wrecker pair in some special cases. Returns true if it wants to handle the
   * movement.
   * */
  function doWreckerModeMovement() {
    let myWrecker = myElements[0];
    let myHealer = myElements[1];

    if (myHealer.fatigue) {
      return;
    }

    // If the healer is next to a rampart and there's a space to which it could move that
    // is still in touch-range of the wrecker but not next to a rampart, move.
    let rampartsNearHealer = rampartsWithinOne(myHealer.pos);
    if (rampartsNearHealer.length) {
      let newPosition = _.find(
        adjacentPositions(myHealer.pos),
        p => p.isNearTo(myWrecker) && rampartsWithinOne(p).length == 0);

      if (newPosition) {
        creepTravelTo(myHealer, newPosition);
        return true;
      }
    }
  }

  function doTravel() {
    if (!myElements.length) {
      setState(State.DONE);
      return;
    }

    let desiredPosition = Otacon.wormTarget(id);

    if (!desiredPosition) {
      logError('I have no desired position.');
      desiredPosition = myElements[0].pos;
    }

    if (desiredPosition.nearEdge) {
      if (doEdgeModeMovement()) {
        return;
      }
    }

    if (myElements.length == 1 && myElements[0].healPower) {
      if (myElements[0].shootPower) {
        if (doLoneSkirmisherMovement()) {
          return;
        }
      } else {
        if (doLoneHealerMovement()) {
          return;
        }
      }
    }

    if (myElements.length == 2 &&
      myElements[0].pos.roomName == desiredPosition.roomName &&
      myElements[0].hasParts(ATTACK) &&
      myElements[1].hasParts(HEAL)) {
      if (doBeaterModeMovement()) {
        return;
      }
    }

    if (myElements.length == 2 &&
      myElements[0].pos.roomName == desiredPosition.roomName &&
      myElements[0].hasParts(RANGED_ATTACK) &&
      myElements[1].hasParts(HEAL)) {
      if (doSniperModeMovement()) {
        return;
      }
    }

    if (myElements.length == 2 &&
      myElements[0].pos.isEqualTo(desiredPosition) &&
      myElements[0].hasParts(WORK) &&
      myElements[1].hasParts(HEAL)) {
      if (doWreckerModeMovement()) {
        return;
      }
    }

    // Maintain contact if inside the target room or about to cross
    // any room edge.
    if (!mem.isConnected) {
      if (myElements[0].pos.roomName == desiredPosition.roomName ||
        myElements[0].pos.nearEdge) {
        
        for (let i = 1; i < myElements.length; i++) {
          creepTravelTo(myElements[i], myElements[i-1].pos);
        }
        return;
      }
    }

    // If connected, don't move in a hostile room unless everyone can
    // move.
    // TODO: This could be relaxed a bit, in the 'uncoiling' case.
    if (_.any(myElements, 'fatigue')) {
      return;
    }

    if (myElements.length > 2 &&
      myElements[0].pos.roomName == desiredPosition.roomName &&
      myElements[1].pos.roomName == desiredPosition.roomName &&
      myElements[2].pos.roomName != desiredPosition.roomName) {
      logEvent(`Entering target room ${desiredPosition.roomName}`);
      setState(State.CROSS);
      return;
    }

    if (myElements.length == 2 &&
      mem.formation == Formation.HEALER_FIRST &&
      myElements[0].pos.roomName == desiredPosition.roomName &&
      myElements[1].pos.roomName == desiredPosition.roomName &&
      !myElements[0].pos.onEdge &&
      !myElements[1].pos.onEdge) {
      creepTravelTo(myElements[0], myElements[1].pos);
      creepTravelTo(myElements[1], myElements[0].pos);
      mem.formation = Formation.WRECKER_FIRST;
      return;
    }

    let approachPoint = desiredPosition.approachPoint;

    if (approachPoint &&
      !myElements[0].isSlotted &&
      myElements[0].pos.getRangeTo(desiredPosition) > 2) {
      desiredPosition = approachPoint;
    }

    for (let i = 0; i < myElements.length; i++) {
      let creepTarget = i ? myElements[i-1].pos : desiredPosition;

      if (myElements[i].pos.isEqualTo(creepTarget)) {
        continue;
      }

      creepTravelTo(myElements[i], creepTarget);
    }
  }

  function doCross() {
    if (!myElements.length) {
      setState(State.DONE);
      return;
    }

    if (myElements.length < 3) {
      setState(State.TRAVEL);
      return;
    }

    let desiredPosition = Otacon.wormTarget(id);

    if (!desiredPosition) {
      logError('I have no desired position.');
      desiredPosition = myElements[0].pos;
    }

    if (myElements[2].pos.roomName == desiredPosition.roomName) {
      setState(State.TRAVEL);
      return;
    }

    if (mem.formation == Formation.HEALER_FIRST &&
      myElements[0].pos.nearEdge &&
      myElements[1].pos.onEdge &&
      myElements[0].pos.roomName == desiredPosition.roomName &&
      myElements[1].pos.roomName == desiredPosition.roomName &&
      !myElements[0].fatigue &&
      !myElements[1].fatigue) {
      creepTravelTo(myElements[0], desiredPosition);
      creepTravelTo(myElements[1], myElements[0].pos);
      return;
    }

    if (mem.formation == Formation.HEALER_FIRST &&
      myElements[1].pos.nearEdge &&
      !myElements[0].fatigue &&
      !myElements[1].fatigue &&
      !myElements[2].fatigue) {
      mem.formation = Formation.WRECKER_FIRST;
      creepTravelTo(myElements[0], myElements[1].pos);
      creepTravelTo(myElements[1], myElements[0].pos);
      creepTravelTo(myElements[2], myElements[1].pos);
      return;
    }
  }

  function doAbort() {
    if (myElements.length) {
      _.forEach(myElements, c => c.memory.state = STATE_DIE);
    } else {
      setState(State.DONE);
    }
  }

  function doDone() {
    mem.delete = true;
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (mem.state) {
      case State.COUNTDOWN:
        doCountdown();
        break;
      case State.SPAWN:
        doSpawn()
        break;
      case State.MUSTER:
        doMuster();
        break;
      case State.SIT:
        logDebug('doSit');
        break;
      case State.TRAVEL:
        try {
          doTravel();
        } catch (err) {
          logError(`doTravel error: ${err}`);
        }
        break;
      case State.CROSS:
        doCross();
        break;
      case State.REVERSE:
        logDebug('doReverse');
        break;
      case State.ABORT:
        doAbort();
        break;
      case State.DONE:
        doDone();
        break;
      default:
        logError(id, `invalid state ${mem.state}`);
        break;
    }
    stateLog.push({state: mem.state, subState: mem.subState});
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log(`Warning: Worm ${id} maxLooped`);
    stateLog.forEach(function(element) {
      console.log(`state: ${element.state} substate: ${element.subState}`);
    });
  }

  // Other-than-movement actions
  for (let i in myElements) {
    let element = myElements[i];
    if (!element.ticksToLive) {
      continue
    };
      
    if (element.getActiveBodyparts(RANGED_ATTACK)) {
      try {
        Elements.doShooterActions(element);
      } catch (err) {
        logError(`Error in doShooterActions: ${err}`);
      }
    }
    if (element.getActiveBodyparts(HEAL)) {
      try {
        Elements.doHealerActions(element);
      } catch (err) {
        logError(`Error in doHealerActions: ${err}`);
      }
    }
    if (element.getActiveBodyparts(WORK)) {
      Elements.doWreckerActions(element);
    }
    if (element.getActiveBodyparts(ATTACK)) {
      Elements.doHitterActions(element);
    }
  }
}

module.exports = {
  Formation,
  State,
  preUpdate,
  update
}
