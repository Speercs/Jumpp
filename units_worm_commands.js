'use strict';

let Worm = require('units_worm_worm');

let wormNameDigits = Game.time;

function getUniqueWormName(root) {
  do {
    let newName = root + (wormNameDigits++ % 100);
    if (!Memory.worms[newName]) {
      return newName;
    }
  } while(1);
}

function setConfig(mem, config) {
  switch (config) {
    case 'test':
      mem.composition = {wrecker:21, healer:21, sister:21};
      break;
    case 'shooterTest':
      mem.composition = {wrecker:60, healer:60, sister:60};
      break;
    case 'hitter':
      mem.composition = {wrecker:23, healer:20};
      break;
    case 'noSister':
      mem.composition = {wrecker:20, healer:20};
      break;
    case 'tough':
      mem.composition = {wrecker:40, healer:40, sister:40};
      break;
    case 'sniper':
      mem.composition = {wrecker:50, healer:20};
      break;
    case 'heavySniper':
      mem.composition = {wrecker:52, healer:52};
      break;
    case 'justWrecker':
      mem.composition = {wrecker:1};
      break;
    case 'justUnarmoredWrecker':
      mem.composition = {wrecker:22};
      break;
    case 'unboosted':
      mem.composition = {wrecker:1, healer:5};
      break;
    case 'slug':
      mem.composition = {wrecker:53};
      break;
    case 'unboostedHitter':
      mem.composition = {wrecker:24};
      break;
    case 'oneTower':
      mem.composition = {wrecker:54};
      break;
    case 'twoTowers':
      mem.composition = {wrecker:55};
      break;
    default:
      console.log(`Error: Unrecognized config option: ${config}`);
      return ERR_INVALID_ARGS;
  }
  mem.config = config;
  return OK;
}

function parseOptions(mem, options) {
  for (let key in options) {
    switch (key) {
      case 'config':
        let result = setConfig(mem, options.config);
        if (result != OK) {
          return result;
        }
        break;
      case 'debug':
        mem.debug = options.debug;
        break;
      case 'spawnTime':
        mem.spawnTime = options.spawnTime;
        break;
      case 'wait':
        if (typeof(options.wait) != 'number') {
          console.log(`Error: Wait value must be a number.`);
          return ERR_INVALID_ARGS;
        }
        mem.spawnTime = Game.time + options.wait;
        break;
      default:
        console.log(`Error: Invalid option ${key}.`);
        return ERR_INVALID_ARGS;
    }
  }

  return OK;
}

Room.prototype.launchWorm = function(targetRoom, options) {
  return launchWorm(this.name, targetRoom, options);
}

global.launchWorm = function(sourceRoom, targetRoom, options) {
  let id = getUniqueWormName('worm');

  if (typeof sourceRoom != 'string' ||
      !Game.rooms[sourceRoom] ||
      !Game.rooms[sourceRoom].controller ||
      !Game.rooms[sourceRoom].controller.my ||
      Game.rooms[sourceRoom].controller.level < 7) {
    return `Error: invalid source room`;
  }

  if (typeof targetRoom != 'string' || !targetRoom.isValidRoomName()) {
    return `Error: invalid target room`;
  }

  let mem = {
      id: id,
      sourceRoom: sourceRoom,
      targetRoom: targetRoom,
      state: Worm.State.COUNTDOWN,
      subState: 0,
      formation: Worm.Formation.HEALER_FIRST,
      creeps: [],
      config: 'default',
      composition: {wrecker: 20, healer: 20, sister: 20}
  };

  let parseResult = parseOptions(mem, options);

  if (parseResult) {
    return parseResult;
  }

  if (Memory.rooms[targetRoom] && Memory.rooms[targetRoom].safemodeEnd > Game.time) {
    console.log(`Warning: targetRoom ${targetRoom} in safemode.`);
    mem.safemodeOk = true;
  }

  Memory.worms[id] = mem;

  return `${id} queued.`;
}

global.wormReport = function() {
  console.log("name      state      config      ttl   source  pos     target\n");
  console.log("-----     -----      ------      ----  ------  ------  ------\n");

  for (let wormName in Memory.worms) {
    let mem = Memory.worms[wormName];
    let target = 'n/a';
    let targetPos = '';
    if (Memory.otacon[mem.targetRoom] &&
        Memory.otacon[mem.targetRoom].targets &&
        Memory.otacon[mem.targetRoom].targets[wormName]) {
      target = Memory.otacon[mem.targetRoom].targets[wormName];
      targetPos = new RoomPosition(target.x, target.y, target.roomName).link;
    }
    let head = Game.getObjectById(mem.creeps[0]);
    let state = (mem.state == Worm.State.COUNTDOWN) ? `t-${mem.spawnTime - Game.time}` : mem.state;
    console.log(_.padRight(`${wormName}`, 10) +
        _.padRight(`${state}`, 11) +
        _.padRight(`${mem.config}`, 12) +
        _.padRight(`${head && head.ticksToLive || 'n/a'}`, 6) +
        _.padRight(`${mem.sourceRoom}`, 8) +
        `${head && head.room.link}  ` +
        _.padRight(`${mem.targetRoom}`, 8) +
        _.padRight(`${targetPos}`, 12));
  }

  return `${_.keys(Memory.worms).length} worms`;
}