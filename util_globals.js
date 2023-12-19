'use strict';

let Alfa = require('role_alfa');
let Appendage = require('role_appendage');
let Archer = require('role_archer');
let Bankhauler = require('role_bankhauler');
let Bankhealer = require('role_bankhealer');
let Basecourier = require('role_basecourier');
let Builder = require('role_builder');
let Claimer = require('role_claimer');
let Corer = require('role_corer');
let Crane = require('role_crane');
let Digger = require('role_digger');
let Dismantler = require('role_dismantler');
let Drone = require('role_drone');
let Engineer = require('role_engineer');
let Firefighter = require('role_firefighter');
let Guardian = require('role_guardian');
let Healer = require('role_healer');
let Hunter = require('role_hunter');
let Loader = require('role_loader');
let Longhauler = require('role_longhauler');
let Miner = require('role_miner');
let Nav = require('util_nav');
let Nurse = require('role_nurse');
let Observe = require('util_observe');
let Queen = require('role_queen');
let Robber = require('role_robber');
let Scout = require('role_scout');
let Settler = require('role_settler');
let Sharder = require('role_sharder');
let Shorthauler = require('role_shorthauler');
let Sister = require('role_sister');
let Skhauler = require('role_skhauler');
let Skminer = require('role_skminer');
let Steer = require('role_steer');
let Template = require('role_template');
let Tug = require('role_tug');
let Upgrader = require('role_upgrader');
let Wagon = require('role_wagon');
let Wheelbarrow = require('role_wheelbarrow');
let Wrecker = require('role_wrecker');

let RoomCallback = require('util_roomCallback');

global.MY_USERNAME = 'Jumpp';

global.MY_MARK = "Ph'nglui mglw'nafh Cthulhu R'lyeh wgah'nagl fhtagn!";

// Players who are unconditionally treated as friendly.
global.FRIENDLIES = ['Aundine', 'o4kapuk', 'ART999', 'Fritee', 'Montblanc',
                     'demawi', 'Kotarou', 'Robalian', 'Screeps'];

// hostiles that we don't start fights with.
// Nakatoli is just some nub who I don't want to bother.
global.NEIGHBORS = ['Geir1983', 'Subodai', 'Nakatoli', '0xDEADFEED', 'js3b', 'Christinayo'];

global.NPCS = ['Invader', 'Source Keeper', 'Power Bank'];
          
global.ERR_NO_FLAG = -100;
global.ERR_NO_BOOST = -101;
global.ERR_FAILED_PRECONDITION = -102;

global.FULL_BUCKET_CPU = 9500;

global.creepExecutionOrder = new Map();

global.creepExecutionOrder.set('scout', Scout);
global.creepExecutionOrder.set('wagon', Wagon);
global.creepExecutionOrder.set('loader', Loader);
global.creepExecutionOrder.set('longhauler', Longhauler);
global.creepExecutionOrder.set('drone', Drone);
global.creepExecutionOrder.set('dismantler', Dismantler);
global.creepExecutionOrder.set('digger', Digger);
global.creepExecutionOrder.set('shorthauler', Shorthauler); // Must go after digger
global.creepExecutionOrder.set('crane', Crane);
global.creepExecutionOrder.set('claimer', Claimer);
global.creepExecutionOrder.set('sharder', Sharder);
global.creepExecutionOrder.set('basecourier', Basecourier);

// Stuff that boosts should some after basecourier.
global.creepExecutionOrder.set('alfa', Alfa);
global.creepExecutionOrder.set('nurse', Nurse);
global.creepExecutionOrder.set('corer', Corer);
global.creepExecutionOrder.set('archer', Archer);
global.creepExecutionOrder.set('miner', Miner);
global.creepExecutionOrder.set('skhauler', Skhauler);
global.creepExecutionOrder.set('skminer', Skminer);
global.creepExecutionOrder.set('queen', Queen);
global.creepExecutionOrder.set('settler', Settler);
global.creepExecutionOrder.set('steer', Steer);
global.creepExecutionOrder.set('upgrader', Upgrader);
global.creepExecutionOrder.set('guardian', Guardian);
global.creepExecutionOrder.set('healer', Healer);
global.creepExecutionOrder.set('hunter', Hunter);
global.creepExecutionOrder.set('wrecker', Wrecker);
global.creepExecutionOrder.set('sister', Sister);
global.creepExecutionOrder.set('engineer', Engineer);
global.creepExecutionOrder.set('template', Template);

global.creepExecutionOrder.set('bankhauler', Bankhauler); // Must go before robber & healer
global.creepExecutionOrder.set('robber', Robber); // Must go before bankhealer.
global.creepExecutionOrder.set('bankhealer', Bankhealer);

// Guys who are allowed to dawdle inside bunkers, and therefore must yield to pretty much anyone.
global.creepExecutionOrder.set('tug', Tug); // Must go after anything that gets tugged.
global.creepExecutionOrder.set('builder', Builder);
global.creepExecutionOrder.set('wheelbarrow', Wheelbarrow); // Must go after builder
global.creepExecutionOrder.set('firefighter', Firefighter);
global.creepExecutionOrder.set('appendage', Appendage);

global.isFriendly = function(username) {
  return FRIENDLIES.includes(username);
}

global.calcTowerDamageAtRange = function(range) {
  let effect = TOWER_POWER_ATTACK;

  if(range > TOWER_OPTIMAL_RANGE) {
    if(range > TOWER_FALLOFF_RANGE) {
      range = TOWER_FALLOFF_RANGE;
    }
    effect -= effect * TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
  }
  return Math.floor(effect);
}

function _deepAdd(a, b) {
  if (typeof a == 'object' || typeof b == 'object') {
    return _.merge(a, b, _deepAdd);
  }
  return (a || 0) + (b || 0);
}

global.deepAdd = function(a, b) {
  let copyA = _.cloneDeep(a);
  return _.merge(copyA, b, _deepAdd);
}

global.drawPath = function(path, color) {
  let lastPosition = path[0];
  for (let position of path) {
    if (position.roomName === lastPosition.roomName) {
      new RoomVisual(position.roomName)
        .line(position, lastPosition, { color: color || 'orange', lineStyle: "dashed" });
    }
    lastPosition = position;
  }
}

global.brickRoom = function(roomName) {
  let roomStatus = Game.map.getRoomStatus(roomName);
  if (!roomStatus || roomStatus.status != 'normal') {
    return ERR_INVALID_ARGS;
  }

  if (!Memory.rooms[roomName]) {
    Memory.rooms[roomName] = {role:'wilderness'};
  }

  Memory.rooms[roomName].execute = true;
  Memory.rooms[roomName].brick = {};
  Observe.setNextScan(roomName, 1);
  console.log(`Bricking room ${roomName}`);
  return OK;
}

global.scanRoom = function(roomName) {
  if (!roomName.isValidRoomName()) return ERR_INVALID_ARGS;
  return Observe.setNextScan(roomName, 1);
}

global.buildRoad = function(path) {
  for (let position of path) {
    let pos = new RoomPosition(position.x, position.y, position.roomName);
    pos.createConstructionSite(STRUCTURE_ROAD);
  }
}

global.drawRoadPath = function(begin, end, range) {
  let result = PathFinder.search(begin, [end], {range: range, swampCost:1, maxOps:40000});
  drawPath(result.path, 'white');
}

global.dx = function(direction) {
  return [undefined,0,1,1,1,0,-1,-1,-1][direction];
}

global.dy = function(direction) {
  return [undefined,-1,-1,0,1,1,1,0,-1][direction];
}

global.getBodyCost = function(body) {
  if (body[0].type) {
    return _.reduce(body, function(total, n) {
      return total + BODYPART_COST[n.type];
    }, 0);
  } else {
    return _.reduce(body, function(total, n) {
      return total + BODYPART_COST[n];
    }, 0);
  }
}

let nameDigits = Game.time;

global.getUniqueCreepName = function(root) {
  do {
    let newName = root + (nameDigits++ % 9000 + 1000);
    if (!Game.creeps[newName]) {
      return newName;
    }
  } while(1);
}

global.roomControllerPos = function(roomName) {
  if (Game.rooms[roomName]) {
    return Game.rooms[roomName].controller && Game.rooms[roomName].controller.pos;
  }

  if (Memory.rooms[roomName] && Memory.rooms[roomName].controllerPos) {
    return new RoomPosition(
        Memory.rooms[roomName].controllerPos.x,
        Memory.rooms[roomName].controllerPos.y,
        roomName);
  }

  return new RoomPosition(25, 25, roomName);
}

global.whoHas = function(resourceType) {
  let inTerminal = _.filter(Game.terminalBases, r => r.terminal.store[resourceType]);
  
  for (let i = 0; i < inTerminal.length; i++) {
    let base = inTerminal[i];
    console.log(base.memory.code + ' has ' + base.terminal.store[resourceType]);
  }
}

global.blockExitsCallback = function(roomName, matrix) {
  if (!matrix) {
    matrix = new PathFinder.CostMatrix;
  }

  try {
    for (let i=0; i < 50; i++) {
      matrix.set(i, 0, 0xff);
      matrix.set(i, 49, 0xff);
      matrix.set(0, i, 0xff);
      matrix.set(49, i, 0xff);
    }
  } catch (err) {
    console.log(`Error in blockExitsCallback: ${err}, matrix = ${matrix}`);
  }
  
  return matrix;
}

function towerDamageAtRoomPosition(pos) {
  let towerPositions;
  if (Game.rooms[pos.roomName]) {
    // We have visibility. Use actual room towers.
    towerPositions = _.map(Game.rooms[pos.roomName].activeTowers, 'pos');
  } else if (Memory.rooms[pos.roomName] && Memory.rooms[pos.roomName].towerPositions) {
    // No visibility. Use recorded ones.
    towerPositions = _.map(
        Memory.rooms[pos.roomName].towerPositions,
        function (p) {
          return new RoomPosition(p.x, p.y, pos.roomName);
        }
    );
  } else {
    return ERR_INVALID_ARGS;
  }
  
  let damages = _(towerPositions)
      .map(function(p) {return calcTowerDamageAtRange(p.getRangeTo(pos))})
      .value();
    
  return _.sum(damages);
}

global.towerDamageAtPosition = function(...args) {
  if (args.length == 1 && args[0] instanceof RoomPosition) {
    return towerDamageAtRoomPosition(args[0]);
  } else if (args.length == 3) {
    return towerDamageAtRoomPosition(new RoomPosition(args[0], args[1], args[2]));
  }
  
  return ERR_INVALID_ARGS;
}

global.peakRoomTowerDamage = function(roomName) {
  let peakDamage = 0;
  let peakPosition;
  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      let pos =new RoomPosition(x, y, roomName);
      let damage = towerDamageAtPosition(pos);
      if (damage > peakDamage) {
        peakDamage = damage;
        peakPosition = pos;
      }
    }
  }
  
  return [peakDamage, peakPosition];
}

global.roomNameLink = function(roomName) {
  return `<a href = '${roomURL(roomName)}'>${roomName}</a>`;
}

global.roomURL = function(roomName) {
  return `https://screeps.com/${Game.shard.ptr ? 'ptr' : 'a'}/#!/room/${Game.shard.name}/${roomName}`;
}

global.takeInventory = function() {
  if (Game.inventory) {
    return Game.inventory;
  }

  Game.inventory = {byRoom: {}, byResource: {}, netOfLabs: {byResource: {}}, labDeficit: {}};
  const roomsWithStuff = _.map(_.filter(Game.rooms, (r) => r.controller && r.controller.my && (r.storage || r.terminal)), 'name');
  
  function storeAdd(a, b) {
    return (a || 0) + (b || 0);
  }

  let total = {};
  let netOfLabsTotal = {};
  for (let i=0; i < roomsWithStuff.length; i++) {
    const room = Game.rooms[roomsWithStuff[i]];
    
    let roomStuff = room.inventory;

    total = _.merge(total, roomStuff, storeAdd);
    
    Game.inventory.byRoom[room.name] = roomStuff;
    for (let resource in roomStuff) {
      if (!Game.inventory.byResource[resource]) {
        Game.inventory.byResource[resource] = {};
      }
      Game.inventory.byResource[resource][room.name] = roomStuff[resource];
    }
    
    let roomLabExcess = room.inventoryNetOfLabs;
    Game.inventory.netOfLabs[room.name] = roomLabExcess;
    for (let resource in roomLabExcess) {
      if (!Game.inventory.netOfLabs.byResource[resource]) {
        Game.inventory.netOfLabs.byResource[resource] = {};
      }
      Game.inventory.netOfLabs.byResource[resource][room.name] = roomLabExcess[resource];
    }
    netOfLabsTotal = _.merge(netOfLabsTotal, roomLabExcess, storeAdd);

    Game.inventory.labDeficit[room.name] = room.labDeficit();
  }
  Game.inventory.total = total;
  Game.inventory.netOfLabs.total = netOfLabsTotal;

  return Game.inventory;
}

global.energyReport = function() {
  console.log(_.padLeft('base',10),
      _.padLeft('energy', 9),
      _.padLeft('upgraders', 9),
      _.padLeft('builders', 9),
      _.padLeft('reasons', 9));
  let bases = _.sortBy(Game.terminalBases, 'name');
  for (let i=0; i < bases.length; i++) {
    let base = bases[i];
    let upgraderWorks = _(base.ownedCreeps)
        .filter(c => c.memory.role == 'upgrader')
        .sum(c => c.getActiveBodyparts(WORK));
    let builderWorks = _(base.ownedCreeps)
        .filter(c => c.memory.role == 'builder' &&
                c.memory.workRoom == base.name)
        .sum(c => c.getActiveBodyparts(WORK));
    let reasons = _(base.ownedCreeps)
        .filter(c => c.memory.role == 'builder' &&
                c.memory.workRoom == base.name)
        .map(c => c.memory.reason)
        .value();
    console.log(base.memory.code,
        base.link,
        _.padLeft(base.roughEnergy, 9),
        _.padLeft(upgraderWorks, 9),
        _.padLeft(builderWorks, 9),
        `  ${reasons}`);
  }
}

function shouldShowFactoryLevel(resource) {
  return resource &&
      COMMODITIES[resource] &&
      COMMODITIES[resource].level;
}

global.mineralReport = function(resourceType, limit=0) {
  takeInventory();

  if (resourceType === undefined) {
    console.log(`mineral   on hand  too much`);
    for (resourceType in MINERAL_MIN_AMOUNT) {
      console.log(_.padLeft(`${resourceType}`, 8) +
          _.padLeft(`${Game.inventory.total[resourceType]}`, 9),
          _.map(_.filter(_.pairs(Game.inventory.byResource[resourceType]), a => a[1] > 100000), function(a) {return `${a[0]} (${a[1]})`;}));
    }
    return;
  }

  let total = 0;
  let showFactory = shouldShowFactoryLevel(resourceType);

  let baseNames = _.keys(Game.inventory.netOfLabs.byResource[resourceType]);
  if (showFactory) {
    baseNames = _.sortBy(
        baseNames,
        n => Game.rooms[n] && (Game.rooms[n].factory || -1) && (Game.rooms[n].factory.level || 0));
  }
  
  for (let base of baseNames) {
    let room = Game.rooms[base];
    let amt = room.roughInventory(resourceType);
    let factoryLevel = room.factory ? `(${room.factory.level || 0})` : `---`;
    total += amt;
    if (amt < limit) continue;
    let line = `${room.link}`;
    if (showFactory) line += _.padLeft(factoryLevel, 4);
    line += ` ${Memory.rooms[base].code}`;
    line += _.padLeft(amt, 6);
    line += [room.nativeMineral, room.nativeCommodity].includes(resourceType) ? ' (native) ' : ' ';
    line += room.terminal && room.terminal.active ? '' : '(no terminal)';
    console.log(line);
  }
  console.log(`total: ${total}`);
}

global.ramReport = function() {
  takeInventory();
  
  let bases = _.filter(Game.terminalBases, r => r.controller.level > 7);

  console.log(_.padLeft('base',16),
      _.padLeft('XGHO2', 9),
      _.padLeft('XZHO2', 9),
      _.padLeft('XLHO2', 9),
      _.padLeft('XZH2O', 9),
      _.padLeft('XKHO2', 9));

  console.log(_.padLeft('(tough)', 27),
      _.padLeft('(move)', 8),
      _.padLeft('(heal)', 9),
      _.padLeft('(wreck)', 10),
      _.padLeft('(shoot)', 9));
        
  function amt(base, resource) {
    let storageAmt = (base.storage && base.storage.store[resource]) || 0;
    let terminalAmt = (base.terminal && base.terminal.store[resource]) || 0;
     
    return storageAmt + terminalAmt;
  }
  
  for (let i=0; i < bases.length; i++) {
    let base = bases[i];
    console.log(
        _.padLeft(base.name, 10),
        _.padLeft(base.memory.code, 5),
        _.padLeft(amt(base, 'XGHO2'), 9),
        _.padLeft(amt(base, 'XZHO2'), 9),
        _.padLeft(amt(base, 'XLHO2'), 9),
        _.padLeft(amt(base, 'XZH2O'), 9),
        _.padLeft(amt(base, 'XKHO2'), 9));
  }
}

global.roughTotal = function(mineralType) {
  return _.sum(Game.terminalBases, b => b.roughInventory(mineralType));
}

global.orderNetResults = function(orders) {
  let results = {};
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    if (order.reverse) continue;
    let recipe = RECIPES[order.resourceType];
    if (!recipe) {
      room.logError('Bad resourceType in lab orders: ' + order.resourceType);
      return ERR_INVALID_ARGS;
    }
    results[recipe[0]] = (results[recipe[0]] || 0) + order.amount;
    results[recipe[1]] = (results[recipe[1]] || 0) + order.amount;
    results[order.resourceType] = (results[order.resourceType] || 0) - order.amount;
  }
  
  return results;
}

global.orderTime = function(orders) {
  return _.sum(orders, function(o) {return REACTION_TIME[o.resourceType] * o.amount / 5});
}

global.labReport = function() {
  let workingLabs = _.filter(Game.terminalBases, b => b.memory.labs && b.memory.labs.execute);

  let results = [];
  
  for (let i=0; i < workingLabs.length; i++) {
    let room = workingLabs[i];

    let code = room.memory.code;
    let link = room.link;
    let numReactors = Math.max(0,room.labs.length - 2);
    let timeToFinish = Math.ceil(orderTime(room.memory.labs.orders) / numReactors);
    let orders = room.memory.labs.orders.length;
    let suffix = (orders > 0 && room.memory.labs.orders[0].reverse) ? ' R' : '';
    let order0 = (orders > 0) ? `(${room.memory.labs.orders[0].amount} ${room.memory.labs.orders[0].resourceType}${suffix})` : ``;
    let sourceLabCooldowns = _(room.labs)
      .filter('sourceLab')
      .map('cooldown')
      .value();
    let otherLabCooldowns = _(room.labs)
      .filter(l => l != room.boostLab && !l.sourceLab)
      .sortBy(l => -l.cooldown)
      .map('cooldown')
      .value();
    
    results.push({link, code, orders, timeToFinish, sourceLabCooldowns, otherLabCooldowns, order0});
  }
  
  _(results)
    .sortBy('timeToFinish')
    .forEach(function(c) {console.log(`${c.link} (${c.code}) work=${c.timeToFinish} ` +
      `orders=${c.orders} cds=${c.sourceLabCooldowns}  ${c.otherLabCooldowns} ${c.order0}`);})
    .value();

  return OK;
}

global.storageReport = function() {
  console.log(_.padLeft('base    ', 12),
        _.padLeft('total', 10),
        _.padLeft('energy', 10),
        _.padLeft('other', 10));
  _(Game.rooms)
    .filter(r => r.controller && r.controller.my && r.storage)
    .sortBy(function (r) {return -_.sum(r.storage.store);})
    .forEach(function(r) {
      console.log(_.padLeft(`${r.memory.code} (${r.link})`,12),
            _.padLeft(_.sum(r.storage.store), 10),
            _.padLeft(r.storage.store.energy, 10),
            _.padLeft(_.sum(r.storage.store) - r.storage.store.energy, 10));
    }).value();
}

global.terminalReport = function() {
  console.log(_.padLeft('base    ', 12),
      _.padLeft('total', 10),
      _.padLeft('energy', 10),
      _.padLeft('other', 10));
  _(Game.rooms)
      .filter(r => r.controller && r.controller.my && r.terminal)
      .sortBy(function (r) {return -_.sum(r.terminal.store);})
      .forEach(function(r) {
        console.log(_.padLeft(`${r.memory.code} (${r.name})`,12),
            _.padLeft(_.sum(r.terminal.store), 10),
            _.padLeft(r.terminal.store.energy, 10),
            _.padLeft(_.sum(r.terminal.store) - r.terminal.store.energy, 10));
      }).value();
}

global.nukeReport = function() {
  function launchStatus(room) {
    if (!room.memory.nuker ||
      !room.memory.nuker.launches ||
      !room.memory.nuker.launches.length) {
      return ' ';
    }

    let launch = room.memory.nuker.launches[0];

    return `launching at ${roomNameLink(launch.target.roomName)} (${launch.target.x}, ` +
      `${launch.target.y}) at t=${launch.launchTime} ` +
      `(${launch.launchTime - Game.time} ticks)`;
  }

  console.log('    base', '   cooldown', '    G', '  energy');
  _(Game.rooms)
    .filter(r => r.controller && r.controller.my && r.nuker && r.nuker.active)
    .forEach(function(r) {
      console.log(
          r.memory.code,
          r.name,
          _.padLeft(r.nuker.cooldown,8),
          _.padLeft(r.nuker.ghodium, 6),
          _.padLeft(r.nuker.energy, 8),
          launchStatus(r));
    }).value();
}

global.baseReport = function() {
  let bases = _(Memory.books.archive[0].energy.byBase)
      .keys()
      .filter(k => Game.rooms[k] && Game.rooms[k].controller.my)
      .map(k => Game.rooms[k])
      .sortBy(k => -Memory.books.archive[0].energy.byBase[k.name].harvested)
      .value();

  let numBases = bases.length;

  let activeSourcesPerBase = {};
  for (let key of _(Memory.rooms).keys().filter(k => Memory.rooms[k].role == 'mine').value()) {
    let numActiveSources = _.filter(Memory.rooms[key].digsites, d => d.sourceId && !d.inactive).length;
    let baseName = Memory.rooms[key].base;
    activeSourcesPerBase[baseName] = (activeSourcesPerBase[baseName] || 0) + numActiveSources;
  }
  
  console.log('    base  ', '  harvested', '      spawn', '       diff', '    sources', ' spawn util');
  for (let i = 0; i < numBases; i++) {
    let base = bases[i];
    
    let harvested = Memory.books.archive[0].energy.byBase[base.name].harvested;
    let spawn = Memory.books.archive[0].energy.byBase[base.name].spawn;
    let difference = harvested - spawn;
    let levelString = '';
    let numSpawns = base.spawns.length;
    let numActiveSources = activeSourcesPerBase[base.name] || 0;
    let spawnUtilizationPct = _.round(_.sum(base.spawns, s => s.memory._util10k) / (100 * numSpawns),2);
    if (base.controller.level < 8) {
      let pct = _.floor((base.controller.progress * 1000) / base.controller.progressTotal ) / 10;
      levelString = `${base.controller.level} ${pct}%`
    }

    console.log(
        base.memory.code,
        base.link,
        _.padLeft(harvested, 11),
        _.padLeft(spawn, 11),
        _.padLeft(difference, 11),
        _.padLeft(numActiveSources, 11),
        _.padLeft(spawnUtilizationPct, 11),
        _.padLeft(_.padRight(levelString, 11), 13),
        );
  }
}

global.greatestKey = function(obj) {
  let keys = Object.keys(obj);

  if (!keys.length) {
    return;
  }

  return keys.reduce(function(a, b){ return obj[a] > obj[b] ? a : b });
}


global.LAST_RESET_TIME = Game.time;

global.ticksSinceReset = function() {
  return Game.time - LAST_RESET_TIME;
}

global.invaders = function() {
  _(Game.rooms)
    .filter(`memory.numInvaders`)
    .forEach(r => r.logError(`${r.memory.numInvaders} invaders.`));
}

global.DefaultRoomCallback = RoomCallback.defaultRoomCallback;

global.staySafeCallback = function(roomName, matrix) {
  DefaultRoomCallback(roomName, matrix);

  let room = Game.rooms[roomName];
  if (!room) {
    return matrix;
  }
  
  if (room.controller && room.controller.safeMode) {
    return matrix;
  }

  if (room.alertCondition == ALERT_CONDITION_RED) {
    room.blockUnsafeTiles(matrix);
  }
  return matrix;
}

global.RECIPES = {};
for(let a in REACTIONS){
  for(let b in REACTIONS[a]){
    RECIPES[REACTIONS[a][b]] = [a,b];
  }
}

global.drawCostMatrix = function(matrix) {
	let visual = new RoomVisual();

	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let opts = {};
			switch (matrix.get(x, y)) {
				case 0xff:
					opts.fill = 'black';
					break;
				default:
					continue;
			}
			visual.rect(x-0.5, y-0.5, 1, 1, opts);
		}
	}
	return OK;
}

let _cachedOpenAreas = {};

global.roomGuardPosition = function(roomName) {
  if (Memory.rooms[roomName] && Memory.rooms[roomName].guardPosition) {
    let pos = Memory.rooms[roomName].guardPosition;
    return new RoomPosition(pos.x, pos.y, roomName);
  } else if (_cachedOpenAreas[roomName]) {
    return _cachedOpenAreas[roomName];
  } else {
    let openSpot = Nav.findCentermostOpenSquare(roomName, 9);
    if (!openSpot) {
      openSpot = Nav.findCentermostOpenSquare(roomName, 3);
    }
    if (!openSpot) {
      openSpot = Nav.findCentermostOpenSquare(roomName, 1);
    }
    return _cachedOpenAreas[roomName] = openSpot;
  }
}

global.MANUFACTURES = [{}, {}, {}, {}, {}, {}];

for(let a in COMMODITIES) {
  let level = COMMODITIES[a].level || 0;
  MANUFACTURES[level][a] = COMMODITIES[a];
}

global.WALLTYPE_CRITICAL = 'critical';
global.WALLTYPE_KEEP = 'keep';
global.WALLTYPE_ONRAMP = 'onramp';
global.WALLTYPE_NARROWER = 'narrower';
global.WALLTYPE_LENGTHENER = 'lengthener';
global.WALLTYPE_GALLERY = 'gallery';
global.WALLTYPE_STUB = 'stub';

// Room alert conditions (see room_role_base)
global.ALERT_CONDITION_RED = 'red';
global.ALERT_CONDITION_GREEN = 'green';

// Standard creep modes (see role.x)
global.STATE_AMNESIAC = 95;
global.STATE_WAYPOINT = 96;
global.STATE_APPENDAGE = 97;
global.STATE_DIE = 99;
global.STATE_CUSTOM = 100;

global.ROOM_HEIGHT = 50;
global.ROOM_WIDTH = 50;

// siegeMap values (room_components_siegeMap)

// Unclassified tile. (Temporary state.)
global.TILE_UNKNOWN = 0;

// Constructed wall tile. (Temporary state.)
global.TILE_WALL = 1;

// Rampart tile that isn't critical, but protects an important structure.
global.TILE_KEEP = 6;

// Other rampart. (Temporary state.)
global.TILE_RAMPART = 2;

// Walkable tile reachable from at least one hostile edge.
global.TILE_EXTERIOR = 4;

// Walkable tile not reachable from any hostile edge, and not within 3 tiles of
// any EXTERIOR tile.
global.TILE_INTERIOR = 3;

// Walkable tile not reachable from any hostile edge, and within 3 of an
// EXTERIOR tile.
global.TILE_EXPOSED = 5;

// Natural wall tile.
global.TILE_NATURAL_WALL = 7;

// Critical wall.
global.TILE_CRITICAL_WALL = 8;

// A non-critical exterior-facing rampart.
global.TILE_GALLERY = 9;

// An interior tile that allows safe approach to CRITICAL ramparts.
global.TILE_ONRAMP = 10;

global.TILE_LENGTHENER = 11;

global.TILE_NARROWER = 12;

// A wall or rampart with no apparent purpose at all.
global.TILE_STUB = 13;

global.WALL_TARGETS = new Map();
WALL_TARGETS.set(TILE_CRITICAL_WALL, 300 * 1000 * 1000);
WALL_TARGETS.set(TILE_KEEP, 20 * 1000 * 1000);
WALL_TARGETS.set(TILE_ONRAMP, 5 * 1000 * 1000);
WALL_TARGETS.set(TILE_NARROWER, 10 * 1000);
WALL_TARGETS.set(TILE_LENGTHENER, 10 * 1000);
WALL_TARGETS.set(TILE_GALLERY, 1000 * 1000);
WALL_TARGETS.set(TILE_STUB, 125 * 1000);

global.WALL_SCALE = new Map();
WALL_SCALE.set(TILE_CRITICAL_WALL, 1);
WALL_SCALE.set(TILE_KEEP, 5);
WALL_SCALE.set(TILE_ONRAMP, 10);
WALL_SCALE.set(TILE_NARROWER, 25);
WALL_SCALE.set(TILE_LENGTHENER, 25);
WALL_SCALE.set(TILE_GALLERY, 25);
WALL_SCALE.set(TILE_STUB, 25);

// wallMap values (room_components_wallMap)
global.WALL_NATURAL = 1;
global.WALL_CRITICAL = 2;
global.WALL_KEEP = 3;
global.WALL_STUB = 4;
global.WALL_GALLERY = 5;
global.WALL_ONRAMP = 6;
global.WALL_NARROWER = 7;
global.WALL_LENGTHENER = 8;
global.WALL_UNKNOWN = 254;

global.IMPORTANT_STRUCTURES = [STRUCTURE_SPAWN, STRUCTURE_TOWER,
  STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_LAB,
  STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN];

global.ARROWS = ['', '⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'];

global.APPROACH_POINT_DISTANCE = 5;

global.DO_OLD_OBSERVERS = false;
global.DO_NEW_OBSERVERS = true;

global.callWithTry = function(fn, ...args) {
  try {
    fn.apply(null, args);
  } catch (err) {
    console.log(`Caught error in ${fn.name}: ${err}.`);
  }
}
