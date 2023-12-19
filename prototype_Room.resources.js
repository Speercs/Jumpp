'use strict';

let resourceLimits = {};

const CACHE_TIMEOUT = 100;
const CACHE_OFFSET  = 8;

function getCacheExpiration() {
  return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

const DEFAULT_ROOM_LIMITS = {
  H: 48000,
  O: 48000,
  U: 24000,
  L: 24000,
  K: 24000,
  Z: 24000,
  X: 24000,
  G: 6000,

  power: 0,
  ops: 0,
  battery: 25000,
  
  ZK: 3000,
  UL: 3000,

  OH: 6000,

  UH: 3000,
  UO: 3000,
  KH: 3000,
  KO: 3000,
  LH: 3000,
  LO: 3000,
  ZH: 3000,
  ZO: 3000,
  GH: 3000,
  GO: 3000,

  UH2O: 3000,
  UHO2: 3000,
  KH20: 3000,
  KHO2: 3000,
  LH20: 3000,
  LHO2: 3000,
  ZH20: 3000,
  ZHO2: 3000,
  GH20: 3000,
  GHO2: 3000,

  XUH2O: 12000,
  XKH2O: 12000,
  XKHO2: 12000,
  XLH2O: 12000,
  XLHO2: 12000,
  XZH2O: 12000,
  XZHO2: 12000,
  XGH2O: 12000,
  XGHO2: 12000,
  
  keanium_bar: 0,
  lemergium_bar: 0,
  utrium_bar: 0,
  zynthium_bar: 0,
  oxidant: 0,
  reductant: 0,
  purifier: 0,
  ghodium_melt: 0,

  silicon: 0,
  biomass: 0,
  metal: 0,
  mist: 0,

  composite: 0,
  crystal: 0,
  liquid: 0,

  wire: 0,
  switch: 0,
  transistor: 0,
  microchip: 0,
  circuit: 0,
  device: 0,

  cell: 0,
  phlegm: 0,
  tissue: 0,
  muscle: 0,
  organoid: 0,
  organism: 0,

  alloy: 0,
  tube: 0,
  fixtures: 0,
  frame: 0,
  hydraulics: 0,
  machine: 0,

  condensate: 0,
  concentrate: 0,
  extract: 0,
  spirit: 0,
  emanation: 0,
  essence: 0,
};

const DEFAULT_FACTORY_LIMITS = {
  [global.RESOURCE_ENERGY]: 10000,

  [global.RESOURCE_GHODIUM]: 1000,

  //[global.RESOURCE_KEANIUM_BAR]: 1000,
  [global.RESOURCE_LEMERGIUM_BAR]: 1000,
  [global.RESOURCE_UTRIUM_BAR]: 1000,
  //[global.RESOURCE_ZYNTHIUM_BAR]: 1000,

  [global.RESOURCE_BATTERY]: 1000,

  [global.RESOURCE_COMPOSITE]: 0,
  [global.RESOURCE_CRYSTAL]: 0,
  [global.RESOURCE_LIQUID]: 0,

  [global.RESOURCE_CELL]: 0,
  [global.RESOURCE_WIRE]: 0,

  [global.RESOURCE_GHODIUM_MELT]: 0,
};


function buildRoomResourceLimits(room) {
  if (!room.activeTerminal || !room.my || room.isVault || room.baseType == 'lw') {
    return {};
  }

  let limits = _.clone(DEFAULT_ROOM_LIMITS);

  limits[room.nativeMineral] += 100000;

  if (room.isPowerEnabled) {
    limits[RESOURCE_OPS] = 25000;
    limits[RESOURCE_BATTERY] = 150000;
  }

  if (room.powerSpawn && room.powerSpawn.active) {
    limits[RESOURCE_POWER] = 50000;
  }

  if (room.factory) {
    limits[room.nativeDepositType] = 36000;

    //limits[RESOURCE_KEANIUM_BAR] = 6000; // we don't make condensate
    limits[RESOURCE_LEMERGIUM_BAR] = 6000;
    limits[RESOURCE_UTRIUM_BAR] = 6000;
    //limits[RESOURCE_ZYNTHIUM_BAR] = 6000; // we don't make alloy

    limits[RESOURCE_CELL] = 6000;
    limits[RESOURCE_WIRE] = 6000;
  }

  if (room.factory && !room.factory.level) {
    limits[RESOURCE_GHODIUM_MELT] = 800;
  }

  if (room.factory && room.factory.level == 1) {
    limits[RESOURCE_ZYNTHIUM_BAR] = 3000; // to make composite
    limits[RESOURCE_COMPOSITE] = 2000;

    limits[RESOURCE_OXIDANT] = 3000; 

    limits[RESOURCE_ALLOY] = 6000;
    limits[RESOURCE_CONDENSATE] = 6000;
  }

  if (room.factory && room.factory.level == 2) {
    limits[RESOURCE_REDUCTANT] = 3000;
    limits[RESOURCE_KEANIUM_BAR] = 3000; // to make crystal
    limits[RESOURCE_PURIFIER] = 2000; // to make crystal

    limits[RESOURCE_CRYSTAL] = 1200;

    limits[RESOURCE_ALLOY] = 6000;

    limits[RESOURCE_PHLEGM] = 200;

    limits[RESOURCE_SWITCH]  = 200;

    limits[RESOURCE_CONCENTRATE] = 1000;
    limits[RESOURCE_CONDENSATE] = 6000;
  }

  if (room.factory && room.factory.level == 3) {
    limits[RESOURCE_ZYNTHIUM_BAR] = 3000;

    limits[RESOURCE_OXIDANT] = 3000;
    limits[RESOURCE_REDUCTANT] = 3000;
    limits[RESOURCE_PURIFIER] = 3000;
    limits[RESOURCE_GHODIUM_MELT] = 1200;
    limits[RESOURCE_LIQUID] = 3000;

    limits[RESOURCE_TISSUE] = 20;
    limits[RESOURCE_PHLEGM] = 200;

    limits[RESOURCE_TRANSISTOR] = 50;
    limits[RESOURCE_COMPOSITE] = 3200;
  }

  if (room.factory && room.factory.level == 4) {
    limits[RESOURCE_OXIDANT] = 3000;
    limits[RESOURCE_PURIFIER] = 3000;

    limits[RESOURCE_MUSCLE] = 10;
    limits[RESOURCE_TISSUE] = 20;

    limits[RESOURCE_MICROCHIP] = 6;
    limits[RESOURCE_TRANSISTOR] = 50;
    limits[RESOURCE_SWITCH] = 200;
  }

  if (room.factory && room.factory.level == 5) {
    limits[RESOURCE_ORGANOID] = 4;
    limits[RESOURCE_LIQUID] = 6000;
    limits[RESOURCE_TISSUE] = 20;

    limits[RESOURCE_CIRCUIT] = 1000;
    limits[RESOURCE_MICROCHIP] = 6;
    limits[RESOURCE_CRYSTAL] = 3600;
    limits[RESOURCE_GHODIUM_MELT] = 1800;
  }

  limits[room.nativeCommodity] = 12000;

  return limits;
}

function buildRoomIdealAmounts(room) {
  let idealAmounts = {
    O: 24000,
    H: 24000,
    U: 12000,
    L: 12000,
    K: 12000,
    Z: 12000,
    X: 12000,

    keanium_bar: 0,
    lemergium_bar: 0,
    utrium_bar: 0,
    zynthium_bar: 0,
    oxidant: 0,
    reductant: 0,
    purifier: 0,
    ghodium_melt: 0,

    composite: 0,
    crystal:0,
    liquid: 0,

    cell: 0,

    XUH2O: 8000,
    XLH2O: 8000,
    XKH2O: 8000,
    XLHO2: 8000,
    XZH2O: 8000,
    XZHO2: 8000,
    XKHO2: 8000,
    XGHO2: 8000,
    XGH2O: 8000,
  };

  idealAmounts[room.nativeMineral] += 12000;

  if (room.factory) {
    idealAmounts[RESOURCE_LEMERGIUM_BAR] = 3000;
    idealAmounts[RESOURCE_UTRIUM_BAR] = 3000;

    // Very strong preference for processing deposits where they're delivered.
    idealAmounts[room.nativeDepositType] = 12000;
    idealAmounts[room.nativeCommodity] = 6000;

    // They like to leave a little in the factory sometimes.

    idealAmounts[RESOURCE_CELL] = 1000;
  }

  if (room.factory && room.factory.level == 1) {
    idealAmounts[RESOURCE_ZYNTHIUM_BAR] = 3000; // to make composite

    idealAmounts[RESOURCE_COMPOSITE] = 800;

    idealAmounts[RESOURCE_OXIDANT] = 3000; 

    idealAmounts[RESOURCE_CELL] = 1600;

    idealAmounts[RESOURCE_WIRE] = 1600;
  }

  if (room.factory && room.factory.level == 2) {
    idealAmounts[RESOURCE_REDUCTANT] = 3000;
    idealAmounts[RESOURCE_KEANIUM_BAR] = 3000; // to make crystal
    idealAmounts[RESOURCE_PURIFIER] = 2000; // to make crystal

    idealAmounts[RESOURCE_CRYSTAL] = 600;

    idealAmounts[RESOURCE_CELL] = 1200;

    idealAmounts[RESOURCE_WIRE] = 1200;
  }

  if (room.factory && room.factory.level == 3) {
    idealAmounts[RESOURCE_ZYNTHIUM_BAR] = 3000;
    idealAmounts[RESOURCE_COMPOSITE] = 800;

    idealAmounts[RESOURCE_OXIDANT] = 3000;
    idealAmounts[RESOURCE_REDUCTANT] = 3000;
    idealAmounts[RESOURCE_PURIFIER] = 3000;
    idealAmounts[RESOURCE_LIQUID] = 300;
    idealAmounts[RESOURCE_GHODIUM_MELT] = 800;

    idealAmounts[RESOURCE_WIRE] = 1600;
  }

  if (room.factory && room.factory.level == 4) {
    idealAmounts[RESOURCE_OXIDANT] = 3000;
    idealAmounts[RESOURCE_PURIFIER] = 3000;
  }

  if (room.factory && room.factory.level == 5) {
    idealAmounts[RESOURCE_CELL] = 1200;
    idealAmounts[RESOURCE_LIQUID] = 3000;
    idealAmounts[RESOURCE_GHODIUM_MELT] = 1200;
    idealAmounts[RESOURCE_CRYSTAL] = 1200;
  }

  /*if (room.isVault) {
    idealAmounts[RESOURCE_LEMERGIUM_BAR] = 64000;
  }*/

  if (room.terminal && room.terminal.servingController) {
    idealAmounts[RESOURCE_OXYGEN] = 0;
    idealAmounts[RESOURCE_HYDROGEN] = 0;
    idealAmounts[RESOURCE_UTRIUM] = 0;
    idealAmounts[RESOURCE_LEMERGIUM] = 0;
    idealAmounts[RESOURCE_KEANIUM] = 0;
    idealAmounts[RESOURCE_ZYNTHIUM] = 0;
    idealAmounts[RESOURCE_CATALYST] = 0;
    idealAmounts.XUH2O = 0;
    idealAmounts.XLH2O = 0;
    idealAmounts.XKH2O = 0;
    idealAmounts.XLHO2 = 0;
    idealAmounts.XZH2O = 0;
    idealAmounts.XZHO2 = 0;
    idealAmounts.XKHO2 = 0;
    idealAmounts.XGHO2 = 0;
  }

  return idealAmounts;
}

function buildRoomFactoryLimits(room) {
  if (room.memory.presShutdown) {
    return {energy:10000}
  }

  if (!room.factory || !room.factory.active || !room.my || room.memory.shutdown) {
    return {};
  }

  let limits = _.clone(DEFAULT_FACTORY_LIMITS);

  limits[room.nativeMineral] = 2500;
  limits[room.nativeDepositType] = 3000;

  if (room.memory._excessMineralType) {
    limits[room.memory._excessMineralType] = 2500;
  }

  if (room.factory.level == 1) {
    limits[RESOURCE_OXIDANT] = 1000; 
    limits[RESOURCE_ZYNTHIUM_BAR] = 2000; // to make composite

    limits[RESOURCE_ALLOY] = 1000;
    limits[RESOURCE_CELL] = 1200;
    limits[RESOURCE_WIRE] = 1200;
    limits[RESOURCE_CONDENSATE] = 1000;
  }

  if (room.factory && room.factory.level == 2) {
    limits[RESOURCE_REDUCTANT] = 1000;
    limits[RESOURCE_KEANIUM_BAR] = 3000; // to make crystal
    limits[RESOURCE_PURIFIER] = 1000; // to make crystal

    limits[RESOURCE_CRYSTAL] = 300;

    limits[RESOURCE_ALLOY] = 1000;

    limits[RESOURCE_PHLEGM] = 100;
    limits[RESOURCE_CELL] = 400;

    limits[RESOURCE_SWITCH] = 68;
    limits[RESOURCE_WIRE] = 800;

    limits[RESOURCE_CONCENTRATE] = 1000;
    limits[RESOURCE_CONDENSATE] = 1000;
  }

  if (room.factory && room.factory.level == 3) {
    limits[RESOURCE_ZYNTHIUM_BAR] = 1000;

    limits[RESOURCE_OXIDANT] = 1000; 
    limits[RESOURCE_REDUCTANT] = 1000;
    limits[RESOURCE_GHODIUM_MELT] = 400;
    limits[RESOURCE_PURIFIER] = 1000;

    limits[RESOURCE_TISSUE] = 20;
    limits[RESOURCE_PHLEGM] = 24;

    limits[RESOURCE_TRANSISTOR] = 50;
    limits[RESOURCE_COMPOSITE] = 400;
    limits[RESOURCE_WIRE] = 1200;
  }

  if (room.factory && room.factory.level == 4) {
    limits[RESOURCE_OXIDANT] = 1000; 
    limits[RESOURCE_PURIFIER] = 1000;

    limits[RESOURCE_MUSCLE] = 10;
    limits[RESOURCE_TISSUE] = 20;

    limits[RESOURCE_MICROCHIP] = 2;
    limits[RESOURCE_TRANSISTOR] = 50;
    limits[RESOURCE_SWITCH] = 8;
  }

  if (room.factory && room.factory.level == 5) {
    limits[RESOURCE_ORGANOID] = 2;
    limits[RESOURCE_LIQUID] = 1000;
    limits[RESOURCE_TISSUE] = 20;
    limits[RESOURCE_CELL] = 1200;

    limits[RESOURCE_CIRCUIT] = 1000;
    limits[RESOURCE_MICROCHIP] = 6;
    limits[RESOURCE_CRYSTAL] = 600;
    limits[RESOURCE_GHODIUM_MELT] = 600;
  }

  return limits;
}

function buildRoomBuyAmounts(room) {
  if(!room.controller || room.controller.level < 8) {
    return {};
  }

  let buyAmounts = {};

  if (false && room.isVault) {
    buyAmounts = {
      H: 36000,
      O: 36000,

      U: 18000,
      K: 18000,
      L: 18000,
      Z: 18000,

      X: 18000,

      energy: 600000,
    };
  } else {
    buyAmounts = {
      H: 12000,
      O: 12000,

      U: 6000,
      K: 6000,
      L: 6000,
      Z: 6000,

      X: 6000,

      energy: 600000,
    };
  }

  // Keep a stash of lemergium_bars at your vault, and buy L to maintain it.
  if (room.nativeMineral == RESOURCE_LEMERGIUM &&
      room.nearestVault &&
      room.nearestVault.roughInventory(RESOURCE_LEMERGIUM_BAR) < 12000) {
    buyAmounts[RESOURCE_LEMERGIUM] = 40000;
  }

  return buyAmounts;
}

function checkCache(room) {
  if (resourceLimits[room.name] && Game.time < resourceLimits[room.name].expiry ) {
    return;
  }

  let roomLimits = buildRoomResourceLimits(room);
  let idealAmounts = buildRoomIdealAmounts(room);
  let factoryLimits = buildRoomFactoryLimits(room);
  let buyAmounts = buildRoomBuyAmounts(room);
  let expiry = Game.time + getCacheExpiration();

  resourceLimits[room.name] = {roomLimits, idealAmounts, factoryLimits, buyAmounts, expiry};
}

Room.prototype.invalidateResourceLimitsCache = function() {
  if (resourceLimits[this.name]) {
    resourceLimits[this.name].expiry = 0;
  }

  return OK;
}

Object.defineProperty(Room.prototype, 'resourceLimits', {
  get: function() {
    checkCache(this);
    if (this._resourceLimits) {
      return this._resourceLimits;
    }

    return this._resourceLimits = resourceLimits[this.name].roomLimits;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'idealAmounts', {
  get: function() {
    checkCache(this);
    if (this._idealAmounts) {
      return this._idealAmounts;
    }

    return this._idealAmounts = resourceLimits[this.name].idealAmounts;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'factoryLimits', {
  get: function() {
    checkCache(this);
    if (this._factoryLimits) {
      return this._factoryLimits;
    }

    return this._factoryLimits = resourceLimits[this.name].factoryLimits;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'buyAmounts', {
  get: function() {
    checkCache(this);
    if (this._buyAmounts) {
      return this._buyAmounts;
    }

    return this._buyAmounts = resourceLimits[this.name].buyAmounts;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});


Object.defineProperty(Room.prototype, 'lastProduce', {
  get: function() {
    return (this.memory._factory && this.memory._factory.lastProduce) || {};
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

