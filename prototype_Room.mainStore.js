'use strict';

Object.defineProperty(Room.prototype, 'mainStore', {
  get: function() {
    if (this._mainStore) {
      return this._mainStore;
    }
    
    // Only owned rooms can have a mainStore.
    if (!this.controller || !this.controller.my) {
      return this._mainStore = false;
    }
    
    // First choice is an active storage.
    if (this.storage && this.storage.my && this.storage.active) {
      return this._mainStore = this.storage;
    }

    // Nth choice is a container where the storage should be.
    if (this.memory.baseType == 'bunker' && 
        !this.activeStorage &&
        this.bunkerCenter) {
      let container = this.bunkerCenter.findInRange(FIND_STRUCTURES, 0, {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
      if (container) {
        return this._mainStore = container;
      }
    }
    
    // Second choice is an active terminal.
    if (this.terminal && this.terminal.my && this.terminal.active) {
      return this._mainStore = this.terminal;
    }

    // Third choice is a valid 'altStorage'
    if (this.memory.altStorage) {
      let alt = Game.getObjectById(this.memory.altStorage);
      if (alt && alt.storeCapacity) {
        return this._mainStore = alt;
      }
    }
    
    // Fourth choice is whatever container is nearest the upgrader.
    if (this.containers.length) {
      let bestContainer = this.controller.pos.findClosestByRange(this.containers);
      if (bestContainer) {
        return this._mainStore = bestContainer;
      }
    }
    
    return undefined;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
