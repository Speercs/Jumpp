'use strict';

let Books = require('util_books');


Object.defineProperty(StructureFactory.prototype, 'availableWork', {
  get: function() {
    let level = this.level;

    if (!level) {
      return 0;
    }

    let room = this.room;

    return _(MANUFACTURES[level])
      .keys()
      .filter(key => shouldProduce(this, key))
      .map(key => room.canProduce(key) * COMMODITIES[key].cooldown)
      .sum();
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

const BIO_COMMODITIES = [
    ``,
    global.RESOURCE_PHLEGM,
    global.RESOURCE_TISSUE,
    global.RESOURCE_MUSCLE,
    global.RESOURCE_ORGANOID,
    global.RESOURCE_ORGANISM];

StructureFactory.prototype.bioNeed = function(debug) {
  let level = this.level;

  if (!level) return ``;

  if (this.availableWork >= 1500) return ``;

  let recipe = COMMODITIES[BIO_COMMODITIES[level]];

  let batches = {};

  for (let key in recipe.components) {
    batches[key] = Math.floor(this.room.roughInventory(key) / recipe.components[key]);
  }

  if (debug) console.log(`batches=${JSON.stringify(batches)}`);

  let idealNumBatches = Math.ceil(1500 / recipe.cooldown);

  let bottlenecks = _.map(_.filter(_.pairs(batches), b => b[1] < idealNumBatches), p => p[0]);

  return bottlenecks;
}

StructureFactory.prototype.myProduce = function(thing) {
  let result = this.produce(thing);

  if (result == OK) {
    this.room.memory._factory.lastProduce = {
      resourceType: thing,
      time: Game.time
    }
  }

  return result;
}

Object.defineProperty(StructureFactory.prototype, 'hasOperate', {
  get: function() {
    return _.any(this.effects, e => e.power == PWR_OPERATE_FACTORY);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'needsOperate', {
  get: function() {
    if (this.room.memory.initFactory) {
      return true;
    }

    return !this.cooldown &&
        this.level &&
        !this.hasOperate &&
        this.availableWork >= 1000;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'excess', {
  get: function() {
    if (this._excess) {
      return this._excess;
    }

    this._excess = {};
    let limits = this.room.factoryLimits;

    for (let resourceType in this.store) {
      let amount = Math.max(0, this.store[resourceType] - (limits[resourceType] || 0));

      if (amount) {
        this._excess[resourceType] = amount;
      }
    }

    return this._excess;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'urgentExcess', {
  get: function() {
    if (this.room.memory.shutdown) {
      return _.clone(this.store);
    }

    if (!(this.level > 3)) {
      return {};
    }

    this._urgentExcess = {};
    let limits = this.room.factoryLimits;

    for (let resourceType in this.store) {
      if (!COMMODITIES[resourceType] || COMMODITIES[resourceType].level < 4) {
        continue;
      }

      let amount = Math.max(0, this.store[resourceType] - (limits[resourceType] || 0));

      if (amount) {
        this._urgentExcess[resourceType] = amount;
      }
    }

    return this._urgentExcess;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'wants', {
  get: function() {

    if (this._wants) {
      return this._wants;
    }

    this._wants = {};

    let limits = this.room.factoryLimits;

    for (let resourceType in limits) {
      let amount = limits[resourceType] - this.store[resourceType];
      if (amount > 0) {
        this._wants[resourceType] = amount;
      }
    }

    return this._wants;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'needs', {
  get: function() {
    let room = this.room;
    let store = this.store;

    if (this._needs) {
      return this._needs;
    }

    let needs = {};

    function addMineral(resourceType, idealAmount) {
      let amountAvailable = (room.terminal && room.terminal.store[resourceType]) || 0;
      let amount = Math.min(amountAvailable, idealAmount - store[resourceType]);
      if (amount > 0) {
        needs[resourceType] = amount;
      }
    }

    for (let resourceType in this.room.factoryLimits) {
      addMineral(resourceType, this.room.factoryLimits[resourceType]);
    }

    return this._needs = needs;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureFactory.prototype, 'urgentNeeds', {
  get: function() {
    let room = this.room;
    let store = this.store;

    if (this._urgentNeeds) {
      return this._urgentNeeds;
    }

    let needs = {};

    function addMineral(resourceType, idealAmount) {
      let amountAvailable = (room.terminal && room.terminal.store[resourceType]) || 0;
      let amount = Math.min(amountAvailable, idealAmount - store[resourceType]);
      if (amount > 0) {
        needs[resourceType] = amount;
      }
    }

    for (let resourceType in this.room.factoryLimits) {
      addMineral(resourceType, this.room.factoryLimits[resourceType] / 2);
    }

    return this._urgentNeeds = needs;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

StructureFactory.prototype.canProduce = function(output) {
  let recipe = COMMODITIES[output];

  if (!recipe) {
    return ERR_INVALID_ARGS;
  }

  if (COMMODITIES[output].level && COMMODITIES[output].level != this.level) {
    return false;
  }

  for (let input in recipe.components) {
    if (this.store[input] < recipe.components[input]) {
      return false;
    }
  }

  return true;
}

StructureFactory.prototype.update = function() {
  try {
    updateImpl(this);
  } catch (err) {
    this.room.logError(`Factory.update error: ${err}`);
  }
}

function shouldMeltBatteries(factory) {
  let vault = factory.room.nearestVault;
  if (vault && vault.roughInventory(RESOURCE_BATTERY) > 500000) {
    return factory.room.roughInventory(RESOURCE_ENERGY) < 700000;
  }
  return factory.room.roughInventory(RESOURCE_ENERGY) < 250000;
}

function shouldProduceBatteries(factory) {
  let vault = factory.room.nearestVault;
  if (vault && vault.roughInventory(RESOURCE_BATTERY) > 500000) return false;
  return (factory.room.roughEnergy > 550000 &&
      factory.room.roughInventory(RESOURCE_BATTERY) < 25000) ||
      (factory.room.roughEnergy > 400000 &&
      factory.room.roughInventory(RESOURCE_BATTERY) < 10000) ||
      factory.room.roughEnergy > 700000;
}

function shouldProcessBiomass(factory) {
  let room = factory.room;
  return room && room.roughEnergy > 200000;
}

function shouldProcessSilicon(factory) {
  let room = factory.room;
  return room && room.roughEnergy > 200000;
}

function shouldProduceNativeCommodity(factory) {
  let room = factory.room;
  let mineral = room.nativeMineral;
  let commodity = room.nativeCommodity;
  let roomCommodity = room.roughInventory(commodity);
  let vault = room.nearestVault;
  let vaultCommodity = (vault && vault.roughInventory(commodity)) || 0;
  let vaultExcessCommodity = (vault && (vaultCommodity - vault.idealAmounts[commodity])) || 0;
  let roomExcessCommodity = Math.max(0, roomCommodity - room.idealAmounts[commodity]);

  // Don't make more if the vault is overstocked.
  if (vaultCommodity > 100000) return false;

  // Don't make more if we're full.
  if (roomCommodity >= room.resourceLimits[commodity]) return false;

  // Make more if the vault has a glut.
  /*if (room.roughInventory(RESOURCE_ENERGY) > 300000 &&
      room.roughInventory(mineral) > 12000 &&
      vault &&
      vaultCommodity < 100000 &&
      vault.roughInventory(mineral) > 500000) {
    return `vault has a glut of ${mineral}`;
  }*/

  // Make more if the vault has a glut that can cover our usage
  if (room.roughInventory(RESOURCE_ENERGY) > 200000 &&
      room.roughInventory(mineral) >= room.idealAmounts[mineral] / 2 &&
      vault &&
      vault.roughInventory(mineral) > 300000 &&
      vaultCommodity < 100000) {
    return `vault has a glut of ${mineral} and we need to top up`;
  }

  // Make more if we don't have enough to give away, and neither does our vault.
  if ((vaultExcessCommodity < 1000) &&
      (roomExcessCommodity < 1000) &&
      room.roughInventory(mineral) > 3000 &&
      room.roughEnergy > 100000) {
    return `room is critically low on bars`;
  }

  // Don't make more if we're low on mineral or energy.
  if (room.roughInventory(mineral) < room.idealAmounts[mineral] + 500) return false;
  if (room.roughInventory(RESOURCE_ENERGY) < 200000) return false;

  // Make more if we are low. Stay up at the limit.
  if (room.roughInventory(commodity) < room.resourceLimits[commodity]) {
    return `room is low on bars (${room.roughInventory(commodity)})`;
  }

  // Make more if the vault is low. Try to keep the vault stocked to at least 12k.
  if (vault && vaultCommodity < 12000) {
    return `vault is low on bars`;
  }
}

const ROOM_LIMIT_RESOURCES = new Set([RESOURCE_CELL, RESOURCE_WIRE,
    RESOURCE_GHODIUM_MELT,
    RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID]);

function shouldProduce(factory, resource) {
  let room = factory.room;
  let vault = room.nearestVault;

  if (ROOM_LIMIT_RESOURCES.has(resource)) {
    return room.roughInventory(resource) + COMMODITIES[resource].amount <=
        room.resourceLimits[resource];
  }

  switch (COMMODITIES[resource].level) {
    case 1:
      return vault.roughInventory(resource) < 100000;
    case 2:
      return vault.roughInventory(resource) < 6000;
    case 3:
      return vault.roughInventory(resource) < 300;
    case 4:
      return vault.roughInventory(resource) < 400;
    case 5:
      return true;
    default:
      return vault.roughInventory(resource) < 12000;
  }
}

let nextCheck = {};

const STUFF_WE_MAKE = new Set([RESOURCE_PHLEGM, RESOURCE_TISSUE, RESOURCE_MUSCLE, RESOURCE_ORGANOID,
  RESOURCE_ORGANISM, RESOURCE_SWITCH, RESOURCE_TRANSISTOR, RESOURCE_MICROCHIP, RESOURCE_CIRCUIT,
  RESOURCE_DEVICE]);

function updateImpl(factory) {
  let room = factory.room;
  if (!room.memory._factory) {
    room.memory._factory = {};
  }

  let mem = room.memory._factory;

  if (!mem.thisCycle) {
    mem.thisCycle = {};
  }

  if (Game.time % 10000 == 0) {
    mem.lastCycle = mem.thisCycle;
    mem.thisCycle = {};
  }

  if (factory.cooldown) {
    mem.thisCycle.inUse = (mem.thisCycle.inUse || 0) + 1;
    let lastCommodity = COMMODITIES[room.lastProduce.resourceType];
    if (lastCommodity && lastCommodity.level) {
      mem.thisCycle.inUseLevel = (mem.thisCycle.inUseLevel || 0) + 1;
    }
  }

  if (factory.cooldown || nextCheck[room.name] > Game.time) {
    return;
  }

  if (factory.canProduce(RESOURCE_BATTERY) && shouldProduceBatteries(factory)) {
    if (factory.myProduce(RESOURCE_BATTERY) == OK) {
      Books.logEnergy(
          factory, 'makeBatteries', COMMODITIES[RESOURCE_BATTERY].components[RESOURCE_ENERGY]);
      return;
    }
  }

  if (!factory.level &&
      shouldProduce(factory, RESOURCE_GHODIUM_MELT) &&
      factory.canProduce(RESOURCE_GHODIUM_MELT)) {
    if (factory.myProduce(RESOURCE_GHODIUM_MELT) == OK) {
      //room.logError(`Producing ghodum_melt (${room.roughInventory(RESOURCE_GHODIUM_MELT)})`);
      Books.logEnergy(
          factory,
          'compressMinerals',
          COMMODITIES[RESOURCE_GHODIUM_MELT].components[RESOURCE_ENERGY]);
      return;
    }
  }

  let nativeCommodity = factory.room.nativeCommodity;
  let shouldReason = shouldProduceNativeCommodity(factory);
  if (shouldReason && factory.canProduce(nativeCommodity)) {
    if (factory.myProduce(nativeCommodity) == OK) {
      //room.logError(`Compressing ${factory.room.nativeMineral} because ${shouldReason}`);
      Books.logEnergy(
          factory, 'compressMinerals', COMMODITIES[nativeCommodity].components[RESOURCE_ENERGY]);
      return;
    }
  }

  if (factory.canProduce(RESOURCE_CELL) && shouldProcessBiomass(factory)) {
    if (factory.myProduce(RESOURCE_CELL) == OK) {
      //room.logError(`Producing cell (${room.roughInventory(RESOURCE_CELL)})`);
      Books.logEnergy(factory, 'higherCommodities', COMMODITIES.cell.components.energy);
      return;
    }
  }

  if (factory.canProduce(RESOURCE_WIRE) && shouldProcessSilicon(factory)) {
    if (factory.myProduce(RESOURCE_WIRE) == OK) {
      //room.logError(`Producing wire (${room.roughInventory(RESOURCE_WIRE)})`);
      Books.logEnergy(factory, 'higherCommodities', COMMODITIES.wire.components.energy);
      return;
    }
  }


  if (room.memory._excessMineralType) {
    let mineral = room.memory._excessMineralType;
    if (room.roughInventory(mineral) > room.idealAmounts[mineral] && room.roughEnergy > 200000) {
      let commodity = _(COMMODITIES[mineral].components).keys().find(s => s != RESOURCE_ENERGY);
      if (factory.canProduce(commodity) && (factory.myProduce(commodity) == OK)) {
        //room.logError(`Compressing ${mineral} because non-native excess. (${room.roughInventory(mineral)})`);
        Books.logEnergy(
          factory, 'compressMinerals', COMMODITIES[commodity].components[RESOURCE_ENERGY]);
      }
    }
  }

  if (factory.level && factory.hasOperate) {
    for (let resource of [RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID]) {
      if (factory.canProduce(resource) && shouldProduce(factory, resource)) {
        if (factory.myProduce(resource) == OK) {
          /*factory.room.logError(`(factory) produced ${COMMODITIES[resource].amount} ${resource} ` +
              `(${factory.room.roughInventory(resource)}) (level-${COMMODITIES[resource].level})`);*/
          Books.logEnergy(
            factory, 'higherCommodities', COMMODITIES[resource].components.energy || 0 );
          return;
        }
      }
    }

    let things = _(MANUFACTURES[factory.level])
      .keys()
      .filter(resource => STUFF_WE_MAKE.has(resource) &&
          factory.canProduce(resource) &&
          shouldProduce(factory, resource))
      .value();
    let thing = _.min(things, t => factory.room.roughInventory(t));
    if (thing) {
      if (factory.myProduce(thing) == OK) {
        factory.room.logDebug(`(factory) produced ${COMMODITIES[thing].amount} ${thing} ` +
            `(level-${COMMODITIES[thing].level}) (options were ${things})`);
        Books.logEnergy(
          factory, 'higherCommodities', COMMODITIES[thing].components.energy || 0 );
        return;
      }
    }
  }

  for (let resource of [RESOURCE_WIRE, RESOURCE_CELL, RESOURCE_ALLOY, RESOURCE_CONDENSATE]) {
    if (factory.canProduce(resource) && shouldProduce(factory, resource)) {
      if (factory.myProduce(resource) == OK) {
        Books.logEnergy(
          factory, 'basicCommodities', COMMODITIES[resource].components.energy || 0 );
        return;
      }
    }
  }

  if (factory.canProduce(RESOURCE_ENERGY) && shouldMeltBatteries(factory)) {
    if (factory.myProduce(RESOURCE_ENERGY) == OK) {
      Books.logEnergy(
        factory, 'meltBatteries', COMMODITIES[RESOURCE_ENERGY].amount );
      return;
    }
  }

  nextCheck[factory.room.name] = Game.time + 10;
}