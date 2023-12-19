'use strict';

let Links = require('util_links');

StructureLink.prototype.registerTransfer = function(source, amount) {
  if (!this._incomingTransfers) {
    this._incomingTransfers = [];
  }

  let id = source.id;
  let amountToTransfer = amount;
  let amountOnHand = source.store.energy;

  this._incomingTransfers.push(new Object({id, amountToTransfer, amountOnHand}));

  Links.registerTransfer(this.id);
}

StructureLink.prototype.executeTransfers = function() {
  if (!this._incomingTransfers) {
    return;
  }
  let best = _.min(this._incomingTransfers, 'amountOnHand');
  let source = Game.getObjectById(best.id);

  // Quick outs:
  // Don't try to neaten up a storage link. They're often messy even in ideal operation.
  // Do not neaten up if the amount that's gonna be left over is 0, which is the ideal
  // Do not neaten up if the amount that's gonna be left over is over 400, because that'll clean
  //     itself up.
  // Do not neaten up if the amount that's gonna be left over is exactly 400: That's normal.
  // Do not neaten up if the amount to transfer is specified. Presume that the sender knows what
  //     they're doing.
  // Do not neaten up if the source creep is going to empty itself on the first go.
  // Do not neaten up if this is a vault. Those harvesters are just weird.
  let remainder = (this.store.energy + source.store.energy) % 800;
  if (remainder == 0 ||
      remainder >= 400 ||
      this == this.room.storageLink || 
      this.store.energy + source.store.energy <= LINK_CAPACITY ||
      this.room.isVault ||
      best.amountToTransfer !== undefined) {
    source.transfer(this, RESOURCE_ENERGY, best.amountToTransfer);
    return;
  }

  let holdback = 401 - remainder;
  let amountToTransfer = 800 - (this.store.energy + holdback);
  amountToTransfer = Math.min(amountToTransfer, source.store.energy);

  /*this.room.logError('==========')
  this.room.logError(`Awkward case: Creep with ${source.store.energy} giving to link with` +
      ` ${this.store.energy} at ${this.pos.link}`);
  this.room.logError(`I am going to fix it by instead transferring ${amountToTransfer}`);
  this.room.logError(`This should leave ${source.store.energy - amountToTransfer} in the ` +
      `creep, and ${this.store.energy + amountToTransfer} in the link.`);*/
  if (amountToTransfer > 0) {
    source.transfer(this, RESOURCE_ENERGY, amountToTransfer);
  }
  return;
}

Object.defineProperty(StructureLink.prototype, 'isDigsiteLink', {
  get: function() {
    if (this._isDigsiteLink != undefined) {
      return this._isDigsiteLink;
    }

    return this._isDigsiteLink = Links.getDigsiteLinkIds(this.room).includes(this.id);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLink.prototype, 'dropLink', {
  get: function() {
    if (this._dropLink != undefined) {
      return this._dropLink;
    }

    return this._dropLink = Links.getDropLinkIds(this.room).includes(this.id);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLink.prototype, 'isReceivingLink', {
  get: function() {
    return this._isReceiver || false;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLink.prototype, 'isSendingLink', {
  get: function() {
    return !this._isReceiver;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let boostedDigsiteLinksCache = {};

StructureLink.prototype.registerBoostedDigsite = function() {
  boostedDigsiteLinksCache[this.id] = Game.time;
}

Object.defineProperty(StructureLink.prototype, 'isBoostedDigsiteLink', {
  get: function() {
    return boostedDigsiteLinksCache[this.id] > Game.time - 200;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLink.prototype, 'source', {
  get: function() {
    if (this._source) return this._source;

    return this._source = _.find(this.pos.findInRange(FIND_SOURCES,2),
        s => this.room.memory.digsites &&
            this.room.memory.digsites[s.id] &&
            this.room.memory.digsites[s.id].link == this.id);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

