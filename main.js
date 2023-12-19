'use strict';

require('class_Quad');
require('class_Sector');
require('class_WorldPosition');
require('foreign_Traveler');
require('prototype_Container');
require('prototype_Creep');
require('prototype_Factory');
require('prototype_Flag');
require('prototype_InvaderCore');
require('prototype_Lab');
require('prototype_Link');
require('prototype_Mineral');
require('prototype_OwnedStructure');
require('prototype_PathFinder.CostMatrix');
require('prototype_PowerBank');
require('prototype_PowerCreep');
require('prototype_PowerSpawn');
require('prototype_Room');
require('prototype_RoomPosition');
require('prototype_Source');
require('prototype_Spawn');
require('prototype_String');
require('prototype_Structure');
require('prototype_StructureController');
require('prototype_Spawn');
require('prototype_Storage');
require('prototype_Store');
require('prototype_KeeperLair');
require('prototype_Terminal');
require('prototype_Tombstone');
require('prototype_Tower');
require('prototype_Wall');

require('util_globals');
require('util_reports');

let Books = require('util_books');
let Broadcast = require('util_broadcast');
let Crew = require('units_crew_update');
let Links = require('util_links');
let Periodics = require('util_periodics');
let Market = require('util_market');
let Observe = require('util_observe');
let Receive = require('util_receive');
let Util = require('util_misc');
let Varzs = require('util_varzs');
let Worm = require('units_worm_update');

//const profiler = require('foreign_Profiler');

//profiler.enable();

module.exports.loop = function() {
//profiler.wrap(function() {
  if (Game.shard.name != 'shard1') {
    return;
  }

  if (global.lastTick && global.LastMemory && Game.time === global.lastTick + 1) {
    delete global.Memory; // delete doesn't trigger the getter like other methods
    global.Memory = global.LastMemory; // Reuse memory reference from initial run
    RawMemory._parsed = global.LastMemory; // Make sure it saves any changes at end of tick
  } else {
    Memory; // force the getter to trigger a parse for measuring
    global.LastMemory = RawMemory._parsed; // save reference of memory in the heap for future ticks
  }

  global.lastTick = Game.time;

  if (Game.cpu.bucket >= FULL_BUCKET_CPU) {
    Memory.fullBucketTicks = (Memory.fullBucketTicks || 0) + 1;
  } else {
    Memory.fullBucketTicks = 0;
  }

  let t0 = Game.cpu.getUsed();

  Memory.profile = {init: t0, dumpExcess:0};
  
  Memory.profile.touchMemory = Game.cpu.getUsed();

  callWithTry(Util.getForeignShards);
  Memory.profile.getForeign = Game.cpu.getUsed();

  Game.bases = _.filter(Game.rooms, r => r.controller && r.controller.my && r.memory.role == 'base');

  Game.terminalBases = _.filter(Game.bases, r => r.activeTerminal && r.terminal.my);

  Game.factoryBases = _.filter(Game.terminalBases, r => r.factory && r.factory.level);

  Game.vaults = _.filter(Game.terminalBases, b => b.isVault);

  Memory.profile.basesAndVaults = Game.cpu.getUsed();

  try {
    for (let base of Game.bases) {
      base.sector.update();
    }
  }  catch (err) {
    console.log(`Error updating sectors: ${err}`);
  }
  
  Memory.profile.sectors = Game.cpu.getUsed();

  Books.init();
  
  callWithTry(Market.processSales);
  callWithTry(Market.processBuys);

  Memory.profile.market = Game.cpu.getUsed();
  
  Util.setRoomGlobals();

  Memory.profile.inits = Game.cpu.getUsed();
  
  Memory.spawnEnabled = false;
  
  try {
    Util.reindexCreeps();
    Memory.spawnEnabled = true;
  } catch (err) {
    console.log('Reindex creeps ' + err);
  }
  
  Memory.profile.creepReindex = Game.cpu.getUsed();
  
  try {
    Util.checkConstructionSites();
  } catch (err) {
    console.log('checkConstructionSites ' + err);
  }
  
  Memory.profile.checkConstructionSites = Game.cpu.getUsed();

  try {
    Util.reindexConstructionSites();
  } catch (err) {
    console.log('Reindex constructionSites ' + err);
  }

  Memory.profile.constructionSiteReindex = Game.cpu.getUsed();
  
  try {
    for (let i in Memory.creeps) {
      if (!Game.creeps[i]) {
        delete Memory.creeps[i];
      }
    }
  } catch (err) {
    console.log('Creep memory cleanup ' + err);
  }
  
  Memory.profile.creepCleanup = Game.cpu.getUsed();

  callWithTry(Util.preUpdateAllCreeps);

  Memory.profile.preUpdateCreeps = Game.cpu.getUsed();

  callWithTry(Market.sellToNpcs);

  Memory.profile.sellToNpcs = Game.cpu.getUsed();

  callWithTry(Market.buyPower);

  Memory.profile.buyPower = Game.cpu.getUsed();

  callWithTry(Periodics.update);

  Memory.profile.periodics = Game.cpu.getUsed();

  Observe.preUpdate();

  Memory.profile.preObserve = Game.cpu.getUsed();

  // Rooms also must execute before creeps, because rooms check themselves for hostiles.
  for (let roomName in Game.rooms) {
    try {
      Game.rooms[roomName].execute();
    } catch (err) {
      console.log(roomName + ' room execute ' + err);
    }
  }
  
  Memory.profile.rooms = Game.cpu.getUsed();

  Observe.postUpdate();

  Memory.profile.postObserve = Game.cpu.getUsed();

  for (let flagName in Game.flags) {
    let flag = Game.flags[flagName];
    if (flag.memory.init != undefined) {
      flag.init();
    }
    let execute = !!(flag.memory.role && (flag.memory.execute != false));
    
    try {
      if (execute) {
        flag.execute();
      }
    } catch (err) {
      console.log(flagName + ' flag execute ' + err);
    }
  }

  Memory.profile.flags = Game.cpu.getUsed();

  for (let i in Memory.flags) {
    if (!Game.flags[i] && !(Memory.flags[i].timestamp + 10 > Game.time)) {
      console.log(Game.time + ': cleaning up dead flag: ' + i);
      delete Memory.flags[i];
    }
  }

  Memory.profile.flagCleanup = Game.cpu.getUsed();

  callWithTry(Quad.updateAll);

  Memory.profile.quads = Game.cpu.getUsed();

  callWithTry(Worm.updateAll);

  Memory.profile.worms = Game.cpu.getUsed();

  callWithTry(Crew.preSpawnUpdate);

  Memory.profile.crewBrains = Game.cpu.getUsed();

  for (let spawn in Game.spawns) {
    try {
      Game.spawns[spawn].execute();
    } catch (err) {
      console.log(spawn + ' spawn caught err=' + err);
    }
  }
  
  Memory.profile.spawns = Game.cpu.getUsed();

  Memory.profile.byRole = {};

  Util.runAllCreeps();

  Memory.profile.creeps = Game.cpu.getUsed();

  callWithTry(Links.executeTransfers);

  Memory.profile.linkTransfers = Game.cpu.getUsed();

  callWithTry(Crew.postSpawnUpdate);

  Memory.profile.crewElements = Game.cpu.getUsed();

  Util.runAllPowerCreeps();

  Memory.profile.powerCreeps = Game.cpu.getUsed();

  callWithTry(Util.shiftMinerals);

  Memory.profile.shiftMinerals = Game.cpu.getUsed();

  Util.handleUnfilledSpawnJobs();

  Memory.profile.handleUnfilledSpawnJobs = Game.cpu.getUsed();

  Util.savePreviousConstructionSites();
  
  Memory.profile.savePreviousConstructionSites = Game.cpu.getUsed();

  callWithTry(Util.shipPowerToAundine);
  //callWithTry(Util.shipEnergyToDrckongen);

  //callWithTry(Util.shipEnergyToDeadfeed);
  //callWithTry(Util.shipOxygenToDeadfeed);

  Broadcast.update();

  Receive.update();

  // Delete any unfilled spawn jobs.
  Memory.spawnJobs = [];

  callWithTry(Varzs.update);

  callWithTry(Util.clearArrivalsAndDepartures);

  callWithTry(Util.doInfrequentGlobalChecks);

  callWithTry(Util.setShardLocal);

  callWithTry(Util.updateBaseDetail);

  Memory.profile.cpu = Game.cpu;
//});
}
