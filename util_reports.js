'use strict';

let Labs = require('room_role_base_labs');
let Nav = require('util_nav');
let Safemode = require('room_components_safemode');
let Sector = require('class_Sector');

global.boostReport = function() {
  takeInventory();

  let amtCooking = Labs.boostsCooking();

  console.log(`     boost          on hand  cooking    total`);
  for (let i=0; i < Labs.KEY_BOOSTS.length; i++) {
    let resourceType = Labs.KEY_BOOSTS[i].resourceType;
    let onHand = Game.inventory.total[resourceType] || 0;
    let cooking = amtCooking[resourceType] || 0;
    let total =  Math.floor((onHand + cooking) / 5) * 5;
    console.log(_.padLeft(Labs.KEY_BOOSTS[i].label, 10) +
        _.padLeft(`(${resourceType})`, 8) +
        _.padLeft(`${onHand}`, 9) +
        _.padLeft(`${cooking}`, 9) +
        _.padLeft(`${total}`, 9));
  }
  console.log(`nextBoost = ${Labs.mostUrgentlyNeededBoost()}`)
}

global.sourceReport = function(count) {
  const DEFAULT_COUNT = 10;
  
  let sources = [];
  for (let roomName in Game.rooms) {
    if (!Memory.rooms[roomName].execute) {
        continue;
    }
    for (let sourceId in Memory.rooms[roomName].digsites) {
      let digsite = Memory.rooms[roomName].digsites[sourceId];
      let cycles = digsite.cycles;
      let pos = digsite.diggerPosition;
      if (digsite.digger && cycles && cycles.length) {
        let mean = Math.floor(100 * _.sum(cycles, 'waste') / cycles.length) / 100;
        sources.push({
            pos: new RoomPosition(pos.x, pos.y, roomName),
            id: sourceId,
            meanWaste: mean,
            recent: _.slice(_.map(cycles, 'waste'), 0, 5)
        });
      }
    }
  }
  
  let sorted = _.sortBy(sources, function(n) {return -n.meanWaste;});
  
  for (let i=0; i < (count || DEFAULT_COUNT); i++) {
    console.log(`${sorted[i].pos.link} ${sorted[i].meanWaste} ${sorted[i].recent}`);
  }
  return OK;
}

global.availableSourceReport = function() {
  let eligibleRooms = _(Memory.rooms)
      .keys()
      .filter(k => Memory.rooms[k].role == 'wilderness' &&
          _.get(Memory.rooms[k], '_last.sourceCheck') &&
          _.isNumber(Memory.rooms[k]._last.sourceCheck.bestCost) &&
          Memory.rooms[k]._last.sourceCheck.bestCost < 180)
      .value();

  _(eligibleRooms)
      .sortBy(k => Memory.rooms[k]._last.sourceCheck.bestCost)
      .forEach(function(roomName) {
        let mem = Memory.rooms[roomName];
        console.log(`${roomNameLink(roomName)} bestCost: ${mem._last.sourceCheck.bestCost}`);
      })
      .value();

  return OK;
}

global.activeSourceReport = function(count) {
  const DEFAULT_COUNT = 10;
  
  let sources = [];
  for (let roomName in Game.rooms) {
    if (Memory.rooms[roomName].role != 'mine') {
        continue;
    }
    for (let sourceId in Memory.rooms[roomName].digsites) {
      let digsite = Memory.rooms[roomName].digsites[sourceId];
      if (digsite.digger && !digsite.inactive && digsite.drop && digsite.drop.steps) {
        let source = Game.getObjectById(sourceId);
        sources.push({
            id: sourceId,
            pos: source.pos,
            steps: digsite.drop.steps,
            cost: digsite.drop.cost,
        });
      }
    }
  }
  
  let sorted = _.sortBy(sources, function(n) {return -n.steps;});
  
  console.log(`source   steps   cost`);
  for (let i=0; i < (count || DEFAULT_COUNT); i++) {
    console.log(`${sorted[i].pos.link} ${sorted[i].steps} ${sorted[i].cost}`);
  }

  sorted = _.sortBy(sources, function(n) {return n.steps;});
  
  console.log(`\nsource   steps   cost`);
  for (let i=0; i < (count || DEFAULT_COUNT); i++) {
    console.log(`${sorted[i].pos.link} ${sorted[i].steps} ${sorted[i].cost}`);
  }
  return OK;
}

global.wallReport = function() {
  function pctHits(hits) {
    return Math.floor(hits.scaledHits / 1000000);
  }

  let bases = _.sortBy(Game.terminalBases, 'name');
  
  console.log(` room        critical      keep    onramp  builders`);
  console.log(`======       ========      ====    ======  ========`);

  for (let i = 0; i < bases.length; i++) {
    let base = bases[i];
    let header = _.padLeft(base.link, 6, ' ');
    let code = base.memory.code;

    let weakestCritical = base.weakestCriticalWall;

    let weakestKeep = base.weakestKeepRampart;
    
    let weakestOnRamp = base.weakestOnRamp;
    
    let builderWorks = _(base.ownedCreeps)
        .filter(c => c.memory.role == 'builder' && c.memory.workRoom == base.name)
        .sum(c => c.getActiveBodyparts(WORK));

    let reasons = _(base.ownedCreeps)
        .filter(c => c.memory.role == 'builder' &&
                      c.memory.workRoom == base.name)
        .map(c => c.memory.reason)
        .value();

    console.log(`${header} ${code} ` +
        _.padLeft(`${pctHits(weakestCritical)}%`, 10) +
        _.padLeft(`${pctHits(weakestKeep)}%`, 10) +
        _.padLeft(`${pctHits(weakestOnRamp)}%`, 10) +
        _.padLeft(`${builderWorks}`, 10) +
        `  ${reasons}`);
  }
  return OK;
}

global.junkReport = function() {
  takeInventory();

  let junkMinerals = _(REACTION_TIME)
      .keys()
      .filter(s => !s.includes('X') && !['G', 'OH'].includes(s))
      .value();

  console.log(`mineral   on hand`);

  _.forEach(
      junkMinerals,
      r => console.log(_.padLeft(`${r}`, 8) + _.padLeft(`${Game.inventory.total[r] || 0}`, 9)));

  console.log(`total = ${_.sum(junkMinerals, r => Game.inventory.total[r])}`);

  return OK;
}

global.harassReport = function() {
  _(Memory.rooms)
      .keys()
      .filter(k => Memory.rooms[k].role == 'mine' && Memory.rooms[k].harassers)
      .forEach(function(k) {
        let perps = _(Memory.rooms[k].harassers)
            .keys()
            .map(p => ` ${p} ${Game.time - Memory.rooms[k].harassers[p]}`)
            .value();
            
        console.log(`${k}(${Memory.rooms[Memory.rooms[k].base].code}) ${perps}`);
      })
      .value();

  return OK;
}

global.powerReport = function() {
  for (let i = 0; i < Memory.powerBankLog.length; i++) {
    let r = Memory.powerBankLog[i];

    if (r.powerLoaded > r.powerAvailable - 125 &&
        r.powerDelivered == r.powerLoaded) {
      continue;
    }

    console.log(`${i}: ${roomNameLink(r.roomName)} available=${r.powerAvailable} ` +
        `loaded=${r.powerLoaded} delivered=${r.powerDelivered} lootTime=${r.stateTimes.looting}`);
  }
}

function classifyRoom(roomName) {
  if (typeof roomName != 'string') {
    return 'notstring';
  }

  if (!roomName.isValidRoomName()) {
    return 'badRoomName';
  }

  let mem = Memory.rooms[roomName];
  let sectorName = Nav.getSectorCenter(roomName);
  let nearestBase = Nav.getNearestBaseManhattan(roomName);
  let nearestBaseDistance = Nav.getRoomDistanceManhattan(roomName, nearestBase.name);
  let hasController = roomName.hasController();
  let basesInSector = _.filter(Game.bases, b => b.sector.name == sectorName);

  if (mem.role == 'skLair') {
    return 'skLair';
  }

  if (mem.role == 'center') {
    return 'farmedCenter';
  }

  if (mem.role == 'mine') {
    return 'mine';
  }

  if (mem.role == 'base') {
    if (Game.rooms[roomName] && Game.rooms[roomName].isMyBase) {
      return 'myBase';
    }

    return 'abandonedBase';
  }

  if (mem.role == 'wilderness') {
    if (!hasController &&
        Memory.sectors[sectorName] &&
        Memory.sectors[sectorName].canClearCores) {
      return 'farmedCenterNine';
    }

    if (!hasController &&
        Memory.sectors[sectorName] &&
        Memory.sectors[sectorName].canClearCores === false) {
      return 'unfarmedCenterNine';
    }

    if (!hasController &&
        Memory.sectors[sectorName] &&
        Memory.sectors[sectorName].canClearCores === undefined) {
      return 'unspecifiedCenterNine';
    }

    if (nearestBaseDistance < 6) {
      return 'man5scan';
    }

    if (hasController && basesInSector.length > 1) {
      return 'sectorScan';
    }

    if (mem.scout && mem.scout.level) {
      return 'base';
    }

    if (hasController && !mem.scout) {
      return 'lackScout';
    }

    if (hasController &&
        mem.scout &&
        !mem.scout.level &&
        basesInSector.length < 2 &&
        nearestBaseDistance > 5) {
      return 'shouldDelete';
    }
  }

  if (mem.role == 'mine') {
    if (!mem.execute) {
      return 'abandonedMine';
    }
  }

  if (mem.role == 'highway') {
    if (nearestBaseDistance > 7) {
      return 'unreachableHighway';
    }

    if (mem.farmPower) {
      return 'powerFarm';
    }

    if (mem.noFarm) {
      return 'offLimitsHighway';
    }
  }

  return 'unknown';
}

global.scanReport = function() {
  let types = {};

  for (let key in Memory.rooms) {
    let mem = Memory.rooms[key];
    if (!mem._nextScan) continue;

    let type = classifyRoom(key);

    if (!types[type]) {
      types[type] = [key];
    } else {
      types[type].push(key);
    }
  }

  for (let key in types) {
    console.log(`${types[key].length} rooms of type ${key}, sample: ${_.sample(types[key])}`);
  }
}

global.highwayReport = function() {
  let types = {};

  for (let key in Memory.rooms) {
    if (Memory.rooms[key].role != 'highway') continue;
    if (Memory.rooms[key].farmPower) continue;
    if (Memory.rooms[key].noFarm) continue;

    let type = classifyRoom(key);

    if (!types[type]) {
      types[type] = [key];
    } else {
      types[type].push(key);
    }
  }

  for (let key in types) {
    console.log(`${types[key].length} rooms of type ${key}, sample: ${_.sample(types[key])}`);
  }
}

function reportOnRooms(roomNames, label) {
  if (!roomNames || !roomNames.length) {
    return;
  }

  let staleness = _.map(roomNames, n => Game.time - Memory.rooms[n]._lastVisible);
  let meanStaleness = _.round(_.sum(staleness) / staleness.length, 1);
  let maxStaleness = _.max(staleness);

  console.log(`${roomNames.length} ${label} rooms, mean=${meanStaleness} max=${maxStaleness}`);
}

Room.prototype.scanReport = function() {
  if (!this.isMyBase) {
    console.log(`Last visible ${Game.time - this.memory._lastVisible} ticks ago, next scan in ` +
        `${this.memory._nextScan - Game.time} ticks`);
    return;
  }

  let nearbyWilderness = _.filter(
      this.findControllersInRangeManhattan(5),
      n => Memory.rooms[n] && Memory.rooms[n].role == 'wilderness');

  // Note: Even if this base doesn't contribute units to power farming, we report staleness anyway
  // because it contributes scanning, and this report is about scanning.
  let nearbyHighway = _.filter(
      this.findHighwaysInRangeManhattan(6),
      n => Memory.rooms[n] && Memory.rooms[n].farmPower);

  reportOnRooms(nearbyWilderness, 'wilderness');
  reportOnRooms(nearbyHighway, 'highway');
}

global.factoryReport = function() {
  let rooms = _(Game.bases)
      .filter(b => b.factory && b.factory.active && b.factory.level)
      .sortBy(b => b.factory.level)
      .value();
  
  let report = ``;

  function uptime(base) {
    let thisCycleTicks = (Game.time % 10000) || 1;
    let thisCycleUptime = base.memory._factory.thisCycle.inUse || 0;
    return `${_.round(thisCycleUptime / thisCycleTicks * 100)}%`;
  }

  function uptimeLevel(base) {
    let thisCycleTicks = (Game.time % 10000) || 1;
    let thisCycleUptime = base.memory._factory.thisCycle.inUseLevel || 0;
    return `${_.round(thisCycleUptime / thisCycleTicks * 100)}%`;
  }

  function lastProduce(base) {
    if (base.memory._factory && base.memory._factory.lastProduce) {
      return `(${base.memory._factory.lastProduce.resourceType}, ` +
          `t-${Game.time - base.memory._factory.lastProduce.time})`;
    }
    return ``;
  }

  report += `   room       level   op'd   cdown  work needs                    uptime     level\n`;
  report += `============  =====   ====   =====  ==== =====                    ======     =====\n`;
  for (let room of rooms) {
    report += `${room.link} (${room.memory.code})` +
    _.padLeft(room.factory.level, 7) +
    _.padLeft(room.factory.hasOperate, 7) +
    _.padLeft(room.factory.cooldown, 7) +
    _.padLeft(room.factory.availableWork, 7) +
    ` ` + _.padRight(room.factory.bioNeed(), 24) +
    ` ` + _.padRight(uptime(room), 10) +
    ` ` + uptimeLevel(room) +
    `      ` + lastProduce(room) +
    `\n`;
  }

  return report;
}

function shortForm(number) {
  if (number < 10) return _.round(number, 3);
  if (number < 100) return _.round(number, 2);
  if (number < 10000) return _.round(number);
  if (number < 1000000) return _.round(number/1000) + 'k';
  if (number < 10000000) return _.round(number/1000000, 2) + 'M';
  if (number < 1000000000) return _.round(number/1000000) + 'M';
  return _.round(number/1000000000) + 'B';
}

function classifyAvoidedRoom(roomName) {
  let mem = Memory.rooms[roomName];

  if (!mem) {
    return `invalid room name`;
  }

  if (!mem.avoid) {
    return `not avoided wtf`;
  }

  if (mem.scout && mem.scout.level) {
    return `level-${mem.scout.level} base`;
  }

  if (mem.avoid.timestamp) {
    return `(${Game.time - mem.avoid.timestamp} ticks old) note: ${mem.avoid.note}`;
  }

  return `???`;
}

global.avoidReport = function() {
  _(Memory.rooms)
      .keys()
      .filter(roomName => Memory.rooms[roomName].avoid)
      .filter(roomName => !(Memory.rooms[roomName].scout && Memory.rooms[roomName].scout.level))
      .forEach(function (roomName) {
        console.log(`${roomNameLink(roomName)}: ${classifyAvoidedRoom(roomName)}`);
      })
      .value();

  return OK;
}

global.marketReport = function(reset) {
  if (!Memory.market.accumulator) return ERR_FAILED_PRECONDITION;

  let acc = Memory.market.accumulator;

  let report = ``;

  let ticksElapsed = Game.time - acc.time;
  let millisElapsed = Date.now() - acc.realTime;
  let hoursElapsed = millisElapsed / (1000 * 60 * 60);

  report += ` Purchases\n`;
  report += `                           unit   total    amt per  amt per  credits\n`;
  report += `        resource   amount  price   cost      tick     hour  per hour\n`;
  report += `        ========   ======  ===== ========  =======  ======= ========\n`;
  _(acc[ORDER_BUY])
      .keys()
      .forEach(function(resourceType) {
        let rec = acc[ORDER_BUY][resourceType];
        let cost = shortForm(rec.cost);
        let unitPrice = shortForm(rec.cost / rec.amount);
        let amountPerTick = shortForm(rec.amount / ticksElapsed);
        let amountPerHour = shortForm(rec.amount / hoursElapsed);
        let creditsPerHour = shortForm(rec.cost / hoursElapsed);
        report += _.padLeft(resourceType, 16) +
            _.padLeft(rec.amount, 9) +
            _.padLeft(unitPrice, 7) +
            _.padLeft(cost, 9) +
            _.padLeft(amountPerTick, 9) +
            _.padLeft(amountPerHour, 9) +
            _.padLeft(creditsPerHour, 9) +
            `\n`;
      })
      .value();

      report += `\n`;
      report += ` Sales\n`;
      report += `                           unit   total    amt per  amt per  credits\n`;
      report += `        resource   amount  price   cost      tick     hour  per hour\n`;
      report += `        ========   ======  ===== ========  =======  ======= ========\n`;
      _(acc[ORDER_SELL])
          .keys()
          .forEach(function(resourceType) {
            let rec = acc[ORDER_SELL][resourceType];
            let cost = shortForm(rec.cost);
            let unitPrice = shortForm(rec.cost / rec.amount);
            let amountPerTick = shortForm(rec.amount / ticksElapsed);
            let amountPerHour = shortForm(rec.amount / hoursElapsed);
            let creditsPerHour = shortForm(rec.cost / hoursElapsed);
            report += _.padLeft(resourceType, 16) +
                _.padLeft(rec.amount, 9) +
                _.padLeft(unitPrice, 7) +
                _.padLeft(cost, 9) +
                _.padLeft(amountPerTick, 9) +
                _.padLeft(amountPerHour, 9) +
                _.padLeft(creditsPerHour, 9) +
                `\n`;
          })
          .value();
  
  let myOpenBuyOrders = _.filter(Game.market.orders, o => o.type == ORDER_BUY && o.active);
  let buyOrderCounts = _.countBy(myOpenBuyOrders, 'resourceType');
  report += `my open buy orders=${myOpenBuyOrders.length} (${JSON.stringify(buyOrderCounts)})`;
  if (reset) {
    report += '(resetting)\n'
    delete Memory.market.accumulator;
  }
  return report;
}

global.baseDetailReport = function(reset) {
  let report = ``;

  _(Memory.longTermBaseDetail)
      .keys()
      .filter(key => key != 'n')
      .sortBy(key => -Memory.longTermBaseDetail[key])
      .forEach(key => report +=
          `${key}: ${_.round(Memory.longTermBaseDetail[key] / Memory.longTermBaseDetail.n, 2)}\n`
      )
      .value();

  if (reset) {
    report += '(resetting)\n'
    delete Memory.longTermBaseDetail;
  }

  return report;
}

const DENSITIES = [15000, 35000, 70000, 100000];

function advisories(roomName) {
  let warnings = ``;
  let sectorName = Nav.getSectorCenter(roomName);
  let sector = Game.sectors[sectorName];
  if (sector.invaderCoreLevel > 3) {
    warnings += ` level-${sector.invaderCoreLevel} core in sector`;
  }

  return warnings;
}

global.skReport = function() {
  let report = ``;
  let currentOperations = _(Memory.rooms)
      .keys()
      .filter(rn => Memory.rooms[rn].role == 'skLair'
          && Memory.rooms[rn].mine &&
          Memory.rooms[rn].mine.state == 'work')
      .value();

  report += `Current operations:\n`;
  for (let roomName of currentOperations) {
    let room = Game.rooms[roomName];
    if (!room) {
      report += `${roomNameLink(roomName)}: (no visibility)\n`;
      continue;
    }

    report += `${roomNameLink(roomName)}: ${room.mineral.mineralAmount} ${room.mineral.mineralType} remaining\n`;
  }

  report += `\nPotential operations:\n`;
  let possibleOperations = _(Memory.rooms)
      .keys()
      .filter(rn => Memory.rooms[rn].role == 'skLair' &&
          Memory.rooms[rn].mine &&
          Memory.rooms[rn].mine.base &&
          Memory.rooms[rn].mine.base.cost <= 100 &&
          !_.get(Memory.rooms[rn], 'scout.lastWorker.owner') &&
          Memory.rooms[rn].mine.state != 'work')
      .value();

  let readyOperations = _.filter(possibleOperations, rn => Memory.rooms[rn].mine.mineral.mineralAmount);

  let futureOperations = _.filter(possibleOperations, rn => !Memory.rooms[rn].mine.mineral.mineralAmount);

  for (let roomName of readyOperations) {
    let mem = Memory.rooms[roomName].mine;
    if (!mem.mineral) {
      report += `${roomNameLink(roomName)}: ???\n`;
    } else {
      report += `${roomNameLink(roomName)}: ${mem.mineral.mineralAmount} ${mem.mineral.mineralType} remaining, cost=${mem.base.cost}`;
      report += advisories(roomName);
      report += '\n';
    }
  }

  for (let roomName of futureOperations) {
    let mem = Memory.rooms[roomName].mine;
    if (!mem.mineral) {
      report += `${roomNameLink(roomName)}: ???\n`;
    } else {
      report += `${roomNameLink(roomName)}: (${DENSITIES[mem.mineral.density]}) ${mem.mineral.mineralType} ticksToRegen=${mem.mineral.regenTime - Game.time}, cost=${mem.base.cost}\n`;
    }
  }

  return report;
}

function safemodeDetails(base) {
  let result = {noController: 0,
      owned: 0,
      reserved: 0,
      unreachable: 0,
      nomem:0,
      unknown: 0,
      n: 0,
      untouched: []};
  let xy = Nav.roomNameToXY(base.name);
  let totalCooldown = 0;
  let minCooldown = Infinity;
  for (let x = xy[0] - 2; x <= xy[0] + 2; x++) {
    for (let y = xy[1] - 2; y <= xy[1] + 2; y++) {
      let roomName = Nav.getRoomNameFromXY(x, y);
      if (!roomName.isValidRoomName() ||
          roomName.isHighway() ||
          roomName.isSkLair() ||
          roomName.isSectorCenter()) {
        result.noController++;
        continue;
      }

      let mem = Memory.rooms[roomName];
      if (!mem) {
        result.nomem++;
        continue;
      }

      if ((mem.role == 'base') || (mem.scout && mem.scout.level > 1)) {
        result.owned++;
        continue;
      }

      if (mem.scout && mem.scout.reserved && mem.scout.reserved.timestamp > Game.time - 1000) {
        result.reserved++;
        continue;
      }

      let endTime = Safemode.getSafeModeEndTime(roomName);

      if (!endTime) {
        result.unknown++;
        continue;
      }

      let cooldown = endTime - Game.time;
      totalCooldown += cooldown;
      result.n++;
      if (cooldown < minCooldown) {
        minCooldown = cooldown;
      }

      if (!(cooldown > 0)) {
        result.untouched.push(roomName);
      }
    }
  }

  result.meanCooldown = Math.floor(totalCooldown / (result.n || 1));
  result.minCooldown = minCooldown;

  return result;
}

function srLine(r) {
  let result = _.padLeft(25-(r.noController + r.reserved + r.owned + r.unreachable), 4);
  let mean = r.n ? r.meanCooldown : 'n/a';
  result += _.padLeft(mean, 7);
  let min = _.isFinite(r.minCooldown) ?  r.minCooldown : 'n/a';
  result += _.padLeft(min, 6);
  result += _.padLeft(r.unknown, 4);
  result += _.padLeft(r.untouched, 4);
  return result;
}

global.safeReport = function() {
  console.log(` base   rooms  mean   min unknown untouched`);
  console.log(` ====   =====  ====   === ======= =========`);
  for (let base of Game.bases) {
    let row = `${roomNameLink(base.name)}: ${base.name.length == 5 ? ' ' : ''} ${srLine(safemodeDetails(base))}`;
    if (base.sector.invaderCoreState == Sector.CoreState.ALIVE) {
      row += ` (Invader)`;
    }
    console.log(row);
  }
  console.log(`===============`);
}

global.miningReport = function(resource) {
  let depositMiners = _.filter(Game.creeps, c => c.memory.role == 'miner');
  let depositTypes = _.countBy(
      _.map(
          depositMiners,
          c => Memory.rooms[c.memory.workRoom].deposits[c.memory.target].depositType
      )
  );
  let numMiners = depositMiners.length;
  let numBiomass = depositTypes.biomass || 0;
  let numSilicon = depositTypes.silicon || 0;
  let minerRoomLinks = _.map(depositMiners, 'room.link');
  console.log(`${numMiners} miners (${minerRoomLinks}), ${numBiomass} on biomass and ${numSilicon} on silicon.`);

  let diggers = _.filter(Game.creeps, c=> c.memory.role == 'digger' && c.memory.model == 6);
  if (resource) {
    diggers = _.filter(diggers, d => d.room.nativeMineral == resource);
  }
  let mineralTypes = _.countBy(_.map(diggers, c => c.room.nativeMineral));
  console.log(`${diggers.length} diggers, working ${JSON.stringify(mineralTypes)}`);

  let workedRooms = new Set();

  for (let digger of diggers) {
    console.log(`${digger.room.link} ${digger.name} ${digger.room.nativeMineral}`);
    workedRooms.add(digger.room.name);
  }

  let idleRooms =  _(Game.bases)
      .filter(b => b.mineral && b.mineral.mineralAmount && !workedRooms.has(b.name))
      .filter(b => !resource || b.nativeMineral == resource)
      .value();

  if (resource) {
    console.log(`Idle deposits: ${JSON.stringify(_.map(idleRooms, 'link'))}`);
  } else {
    let idleDeposits = _(idleRooms)
        .map('mineral.mineralType')
        .countBy();
   console.log(`Idle deposits: ${JSON.stringify(idleDeposits)}`);
  }
}