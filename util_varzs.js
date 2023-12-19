'use strict';


function initVarzs() {
  if (!Memory._varzs) {
    Memory._varzs = {};
  }

  if (!Memory._varzs.biomass) {
    Memory._varzs.biomass = [0];
  }

  if (!Memory._varzs.groupEvents) {
    Memory._varzs.groupEvents = [0];
  }

  if (!Memory._varzs.power) {
    Memory._varzs.power = [0];
  }

  if (!Memory._varzs.shard1Waste) {
    Memory._varzs.shard1Waste = [0];
  }

  if (!Memory._varzs.harvest) {
    Memory._varzs.harvest = [0];
  }

  if (!Memory._varzs.silicon) {
    Memory._varzs.silicon = [0];
  }

  if (!Memory._varzs.upgrade) {
    Memory._varzs.upgrade = [0];
  }
}

function logGroupEvents(time) {
  initVarzs();

  Memory._varzs.groupEvents[0] += time;
}

function logBiomass(amount) {
  initVarzs();

  Memory._varzs.biomass[0] += amount;
}

function logPower(amount) {
  initVarzs();

  Memory._varzs.power[0] += amount;
}

function logShard1Waste(amount) {
  initVarzs();

  Memory._varzs.shard1Waste[0] += amount;
}

function logHarvest(amount) {
  initVarzs();

  Memory._varzs.harvest[0] += amount;
}

function logSilicon(amount) {
  initVarzs();

  Memory._varzs.silicon[0] += amount;
}

function logUpgrade(amount) {
  initVarzs();

  Memory._varzs.upgrade[0] += amount;
}

function finish(label) {
  let mean = _.sum(Memory._varzs[label]) / Memory._varzs[label].length;
  Memory._varzs[label].unshift(0);
  Memory._varzs[label] = _.slice(Memory._varzs[label], 0, 10);

  return mean;
}

function update() {
  let excess = Game.cpu.shardLimits[Game.shard.name] - Game.cpu.getUsed();
  let bucket = 10000 - Game.cpu.bucket;
  let waste = Math.max(0, excess - bucket);
  if (!Memory.shardLocal) {
    Memory.shardLocal = {};
  }

  if (Game.shard.name == 'shard1') {
    logShard1Waste(waste);
  }

  initVarzs();

  let biomass = finish('biomass');
  let meanGroupEvents = finish('groupEvents');
  let harvest = finish('harvest');
  let meanPower = finish('power');
  let meanShard1Waste = finish('shard1Waste');
  let silicon = finish('silicon');
  let upgrade = finish('upgrade');
  let openOrders = _.filter(Game.market.orders, o => o.type == ORDER_BUY && o.active).length;

  Memory.shardLocal.waste = waste;

  let distro = 0;

  if (Memory.profile &&
      Memory.profile.shiftMinerals &&
      Memory.profile.powerCreeps &&
      Memory.profile.baseDetail) {
    distro = Memory.profile.shiftMinerals -
    Memory.profile.powerCreeps +
    Memory.profile.dumpExcess;
  }

  let haulers = 0;

  if (Memory.profile &&
      Memory.profile.byRole &&
      Memory.profile.byRole.longhauler &&
      Memory.profile.byRole.longhauler.totalTime) {
    haulers = Memory.profile.byRole.longhauler.totalTime;
  }

  let reservePower = 0, reserveBiomass = 0, reserveSpace = 0;

  if (Game.rooms.E17N28 && Game.rooms.E17N28.isVault) {
    reservePower = Game.rooms.E17N28.roughInventory(RESOURCE_POWER);
    reserveBiomass = Game.rooms.E17N28.roughInventory(RESOURCE_BIOMASS);
    if (Game.rooms.E17N28.storage) {
      reserveSpace = Game.rooms.E17N28.storage.store.getFreeCapacity();
    }
  }

  Memory.stats = {
      [Game.shard.name]: {
          cpu: {
              used: Game.cpu.getUsed(),
              bucket: Game.cpu.bucket,
              distro: distro,
              haulers: haulers,
              groupEvents: meanGroupEvents,
              shard1Waste: meanShard1Waste,
          },
          power: {
              processed: meanPower,
              reserve: reservePower,
          },
          energy: {
            harvest: harvest,
            upgrade: upgrade,
          },
          deposits: {
            biomass: biomass,
            silicon: silicon,
          },
          reserves: {
            biomass: reserveBiomass,
            power: reservePower,
            space: reserveSpace
          },
          cash: {
            credits: Game.market.credits,
            openOrders: openOrders,
          }
      }
  }
}

module.exports = {
  logBiomass,
  logGroupEvents,
  logHarvest,
  logPower,
  logSilicon,
  logUpgrade,
  update,
}