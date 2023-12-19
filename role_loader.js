'use strict';

let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');

const STATE_PICKUP = 1;
const STATE_DELIVER = 2;
const STATE_BUNKER_INIT = 3;
const STATE_CRANE = 4;
const STATE_LAP = 5;
const STATE_CLEAR_STONE = 6;

function currentModel(energyBudget) {
  return Math.max(1, Math.min(16, Math.floor(energyBudget / 150)));
}

function getBody(model) {
  let body = [];
  for (let i = 0; i < model * 2; i++) {
    body.push(CARRY);
  }
  for (let i = 0; i < model; i++) {
    body.push(MOVE);
  }
  return body;
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
        role: 'loader',
        model: model,
        state: STATE_PICKUP,
        subState: 0,
        renewMe: true
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Loader');
}

const VALID_SUB_ROLES = ['bunkerSW', 'bunkerNW', 'bunkerNE', 'bunkerSE'];

function requestSpawn(rooms, model, flag, priority, subRole) {
  if (!rooms || !Array.isArray(rooms) || !model || !priority) {
    flag.logError('Bad args to Loader.requestSpawn');
    return ERR_INVALID_ARGS;
  }

  if (subRole && !VALID_SUB_ROLES.includes(subRole)) {
    flag.logError('Bad subRole: ' + subRole);
    return ERR_INVALID_ARGS;
  }

  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  if (subRole) {
    opts.memory.subRole = subRole;
    opts.memory.state = STATE_BUNKER_INIT;
  }
  
  if (flag) {
    opts.memory.flagName = flag.name;
  }

  opts.memory.workRoom = (flag && flag.pos.roomName) || rooms[0];
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  let storage = creep.room.activeStorage ||
      Game.getObjectById(creep.room.memory.altStorage) ||
      creep.room.mainStore;
  
  let terminalEnergy = (creep.room.terminal &&
      !creep.room.memory.ignoreTerminal &&
      creep.room.terminal.store.energy) || 0;
      
  let storageEnergy = (creep.room.storage && creep.room.storage.store.energy) || 0;
        
  if (terminalEnergy > storageEnergy && creep.room.baseType != 'lw') {
      storage = creep.room.terminal;
  }

  function myTravelTo(target, opts) {
    let options = {
        maxRooms: 1,
        range: 1,
        restrictDistance: 1,
    };
    
    _.merge(options, opts);

    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function doPickup() {
    if (creep.isFull) {
      setState(STATE_DELIVER);
      return;
    }
    
    if (creep.store.energy && !storage.store.energy) {
      setState(STATE_DELIVER);
      return;
    }
    
    if (creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(storage);
    }
  }
  
  function doDeliver() {
    if (creep.store.energy == 0) {
      setState(STATE_PICKUP);
      return;
    }
    
    if (creep.ticksToLive < 50) {
      setState(STATE_DIE);
    }

    // Get nearby stuff that needs energy.
    let servedStructures = creep.room.otherExtensions;
    
    if (creep.room.baseType != 'tigga') {
      servedStructures =
          servedStructures.concat(_.filter(creep.room.spawns, s => !s.isDiggerSpawn));
    }
    
    // Don't count on diggers to fill extensions below RCL5.
    if (creep.room.controller.level < 5) {
      servedStructures = servedStructures.concat(creep.room.diggerExtensions);
    }
        
    if (!creep.room.activeStorage || !creep.room.basecouriers.length) {
      let needyTowers = _.filter(creep.room.activeTowers, t => t.store.energy < TOWER_CAPACITY/2);
      if (needyTowers.length) {
        servedStructures = servedStructures.concat(needyTowers);
      }
    }

    // Ignore any structures near a storage crane in an lw base.
    if (creep.room.baseType == 'lw' && creep.room.storageCrane) {
      servedStructures = _.filter(servedStructures, s => s.pos.getRangeTo(creep.room.storageCrane) > 1);
    }
    
    servedStructures = _.compact(servedStructures);

    let nearNeeders = creep.pos.findInRange(servedStructures, 1, {
        filter: s => s.energy < s.energyCapacity
    });
    
    // If there's anything nearby that needs energy, fill one.
    if (nearNeeders.length) {
      let neediest = _.min(nearNeeders, 'energy');
      creep.myTransfer(neediest, RESOURCE_ENERGY);
      
      // If that's the last of my energy, get a head start on returning to storage.
      if (neediest.energyCapacity - neediest.energy >= creep.store.energy) {
        myTravelTo(storage);
        return;
      }
    }
        
    // If there were zero or one things that needed energy, move to the next nearest.
    if (nearNeeders.length < 2) {
      let next = creep.pos.findClosestByPath(servedStructures, {
          filter: s => s.energy < s.energyCapacity
      });
      
      if (next) {
        myTravelTo(next);
      } else if (!creep.isFull && storage && storage.store.energy) {
        setState(STATE_PICKUP);
      } else {
        if (creep.room.memory.loaderIdlePos) {
          myTravelTo(
              creep.room.getPositionAt(creep.room.memory.loaderIdlePos.x,
                  creep.room.memory.loaderIdlePos.y),
              {range: 0});
        } else {
          myTravelTo(storage);
        }
      }
    }
    
    if (!creep.isFull &&
        storage.store.energy &&
        creep.pos.isNearTo(storage)) {
      creep.withdraw(storage, RESOURCE_ENERGY);
    }
  }
  
  function doBunkerInit() {
    function initRestAndExtensions(xSense, ySense) {
      creep.memory.restPosition = {
          x: creep.room.storage.pos.x + xSense,
          y: creep.room.storage.pos.y + ySense
      };
    }
    
    function initRoute(dx, dy, tail) {
      let x = _.padLeft((creep.room.storage.pos.x + dx).toString(), 2, '0');
      let y = _.padLeft((creep.room.storage.pos.y + dy).toString(), 2, '0');
      creep.memory.route = x.concat(y).concat(tail);
    }

    if (!creep.memory.restPosition || !creep.memory.route) {
      creep.logDebug('initializing');
      switch (creep.memory.subRole) {
        case 'bunkerNE':
          initRestAndExtensions(1, -1);
          initRoute(1, -2, '182234456687');
          break;
        case 'bunkerSE':
          initRestAndExtensions(1, 1);
          initRoute(2, 1, '324456678821');
          break;
        case 'bunkerSW':
          initRestAndExtensions(-1, 1);
          initRoute(-1, 2, '546678812243');
          break;
        case 'bunkerNW':
          initRestAndExtensions(-1, -1);
          initRoute(-2, -1, '768812234465');
          break;
        default:
          creep.logError('bad subRole');
          break;
      }
    }

    if (creep.pos.x != creep.memory.restPosition.x ||
        creep.pos.y != creep.memory.restPosition.y) {
      creep.logDebug('moving into position');
      creep.moveTo(creep.memory.restPosition.x, creep.memory.restPosition.y);
      return;
    }
    
    setState(STATE_CRANE);
    return;
  }
  
  const MAX_CREEP_COST = 11050;
  
  // Returns the extensions I can reach that lack energy.
  function myCheckExtensions() {
    if (creep.room.energyAvailable >= MAX_CREEP_COST ||
        (Game.cpu.bucket < FULL_BUCKET_CPU && !creep.name.hashTime(2)) ||
        (Game.cpu.bucket < 5000 && !creep.name.hashTime(8))) {
      return [];
    }

    let xSense = creep.memory.restPosition.x - creep.room.storage.pos.x;
    let ySense = creep.memory.restPosition.y - creep.room.storage.pos.y;
    
    let cx = creep.room.bunkerCenter.x;
    let cy = creep.room.bunkerCenter.y;
    
    return _.filter(creep.room.needyExtensions,
        e => (e.pos.x - cx) * xSense >= 0 && (e.pos.y - cy) * ySense >= 0);
  }

  function findStone() {
    return creep.pos.findInRange(FIND_TOMBSTONES, 1, {filter: ts => _.any(ts.store)})[0];
  }

  function doCrane() {
    if (creep.memory.restPosition.x != creep.pos.x ||
        creep.memory.restPosition.y != creep.pos.y) {
      creep.logError(`I somehow got out of rest position in crane mode. Fixing.`);
      setState(STATE_BUNKER_INIT);
      return;
    }

    // If TTL gets sufficiently low, set self noRenew. This will cause a replacement to be
    // spawned. This helps prevent the case in which a loader expires when a bunch of energy
    // structures are empty.
    if (creep.memory.renewMe && (creep.ticksToLive < 200)) {
      creep.memory.noRenew = true;
      delete creep.memory.renewMe;
    }
    
    if ((creep.memory._nextStoneCheck || 0) < Game.time || creep.memory._lastStoneOp > Game.time - 10) {
      creep.memory._nextStoneCheck = Game.time + 40 + _.round(Math.random() * 20);
      if (findStone()) {
        creep.memory._lastStoneOp = Game.time;
        setState(STATE_CLEAR_STONE);
        return;
      }
    }

    if (creep.isFull || (creep.store.energy && !creep.room.storage.store.energy)) {
      let myNeedyExts = myCheckExtensions();
      let need = _.sum(myNeedyExts, e => e.store.getFreeCapacity(RESOURCE_ENERGY));
      if (need && (creep.room.level < 8 || need > 800)) {
        creep.moveByPath(creep.memory.route);
        setNextPosFromPath();
        setState(STATE_LAP);
        repeat = false;
        creep.logDebug('starting route');
        return;
      }
    }

    if (Game.cpu.bucket >= FULL_BUCKET_CPU || creep.name.hashTime(8)) {
      let needers = creep.pos.findInRange(_.union(creep.room.spawns, creep.room.activeTowers), 1, {
          filter: s => s.energy < s.energyCapacity && !s.energyIncoming
      });
      if (needers.length &&
          creep.store.energy &&
          creep.room.storage &&
          creep.room.storage.store.energy > 10000) {
        let neediest = _.min(needers, 'energy');
        creep.myTransfer(neediest, RESOURCE_ENERGY);
        neediest.energyIncoming = true;
        return;
      }
    }
    
    if (!creep.isFull) {
      creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
      creep.logDebug('withdrawing');
    }
  }
  
  function setNextPosFromPath() {
    let dp = Room.deserializePath(creep.memory.route);
    let idx = _.findIndex(dp, i => i.x == creep.pos.x && i.y == creep.pos.y);
    if (idx != -1) {
      idx = (idx + 1) % dp.length;
      creep.nextPos = new RoomPosition(dp[idx].x, dp[idx].y, creep.room.name);
    }
    creep.memory.intendedPos = creep.nextPos;
  }
  
  function doLap() {
    // Complain if we're in the same position as last tick.
    if (creep.pos.isEqualTo(creep.previousPos)) {
      creep.memory.ticksBlocked = (creep.memory.ticksBlocked || 0) + 1;

      if (creep.memory.ticksBlocked > 20) {
        if ((creep.memory.lastBlockedWrite || 0) + 100 < Game.time) {
          EventLog.writeEntry(EventLog.DEBUG, creep.room.name, `blocked for a long time`);
          creep.memory.lastBlockedWrite = Game.time;
        }
        let ip = creep.memory.intendedPos;
        let intendedPos = new RoomPosition(ip.x, ip.y, ip.roomName);
        let blockingCreeps = intendedPos.lookFor(LOOK_CREEPS);
        let blockingPowerCreeps = intendedPos.lookFor(LOOK_POWER_CREEPS);
        let blockerName = (blockingCreeps[0] && blockingCreeps[0].name) ||
            (blockingPowerCreeps[0] && blockingPowerCreeps[0].name) ||
            "no one";
        creep.logError(`${creep.pos.link} I've been stuck for ` +
            `${creep.memory.ticksBlocked} ticks. Intended pos was ${intendedPos},` +
            ` blocked by ${blockerName}`);
      }		
    } else {
      creep.memory.ticksBlocked = 0;
    }

    if (creep.fatigue &&
        creep.room.roughEnergy > 200000 &&
        creep.room.controller &&
        creep.room.controller.level == 8 &&
        !creep.pos.hasRoad() &&
        !creep.pos.hasConstructionSite() &&
        creep.room.storage &&
        !creep.pos.isNearTo(creep.room.storage) &&
        _.keys(Game.constructionSites).length < 50 &&
        !creep.room.constructionSites.length) {
      creep.logError('fatigued baseLoader on route. Creating construction site.');
      creep.room.createConstructionSite(creep.pos, STRUCTURE_ROAD);
    }

    if (creep.pos.isNearTo(creep.room.storage)) {
      creep.logDebug('done with route');
      setState(STATE_CRANE);
      return;
    }

    // Move.
    creep.moveByPath(creep.memory.route);
    setNextPosFromPath();
    if (!creep.memory.intendedPos) {
      // No idea how this can happen, but it has. Some loader just moved off his lane for no
      // apparent reason. Going to crane mode will fix it.
      setState(STATE_CRANE);
      return;
    }

    if (!creep.nextPos) {
      creep.logError(`${creep.pos.link} I don't have a nextPos, and I should.`);
    }
    
    if (creep.pos.isEqualTo(creep.nextPos)) {
      creep.logError(`${creep.pos.link} My nextPos is equal to my currentPos, but I'm in LAP mode.`);
    }

    // If we have energy, deliver to the neediest extension in range.
    if (creep.store.energy) {
      let needers = creep.pos.findInRange(creep.room.extensions, 1, {
          filter: s => /*s.active && */ s.energy < s.energyCapacity
      });

      if (needers.length && creep.nextPos) {
        // Prefer the ones that won't be in range next tick.
        needers = _.sortBy(needers, function(s) {return -creep.nextPos.getRangeTo(s)});
        creep.logDebug('transferring');
        creep.myTransfer(_.min(needers, 'energy'), RESOURCE_ENERGY);
      }
    }
  }

  function doClearStone() {
    if (creep.memory.restPosition.x != creep.pos.x ||
        creep.memory.restPosition.y != creep.pos.y) {
      creep.logError(`I somehow got out of rest position in clearStone mode. Fixing.`);
      setState(STATE_BUNKER_INIT);
      return;
    }

    if (!creep.isEmpty) {
      creep.myTransfer(creep.room.storage, creep.mainCargo());
      return;
    }

    let stone = findStone();

    if (stone) {
      creep.withdraw(stone, stone.mainCargo());
      return;
    }

    setState(STATE_CRANE);
  }

  function doCustom() {
  }
  
  creep.doDieIfNuke(25);
  
  let replacement = _.filter(creep.room.ownedCreeps,
          c => c.id != creep.id &&
               c.memory.model >= creep.memory.model &&
               c.memory.role == creep.memory.role &&
               c.memory.subRole == creep.memory.subRole &&
               c.ticksToLive > creep.ticksToLive);
               
  if (replacement.length && creep.memory.state != STATE_DIE) {
      creep.setState(STATE_DIE);
  }
  
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_BUNKER_INIT:
        doBunkerInit();
        break;
      case STATE_CRANE:
        doCrane();
        break;
      case STATE_LAP:
        doLap();
        break;
      case STATE_CLEAR_STONE:
        doClearStone();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
    default:
    setState(STATE_PICKUP);
    break;
  }
    stateLog.push({state: creep.memory.state, subState: creep.memory.subState});
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    stateLog.forEach(function(element) {
      creep.logError('state: ' + element.state + ' substate: ' + element.subState);
    });
  }
}

module.exports = {
  currentModel,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
}

