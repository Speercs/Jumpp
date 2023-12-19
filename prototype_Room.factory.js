'use strict';

Room.prototype.canProduce = function(output) {
  let recipe = COMMODITIES[output];

  if (!recipe) {
    return ERR_INVALID_ARGS;
  }

  let canMake = Infinity;

  for (let input in recipe.components) {
    let reagentLimit = Math.floor(this.roughInventory(input) / recipe.components[input]);

    canMake = Math.min(canMake, reagentLimit);
  }

  return canMake;
}

Object.defineProperty(Room.prototype, 'factoryServerPosition', {
  get: function() {
    if (this.memory.factoryServerPosition) {
      return this.getPositionAt(
        this.memory.factoryServerPosition.x,
        this.memory.factoryServerPosition.y);
    }
    if (this.baseType == 'bunker' && this.terminal && this.factory) {
      return this.getPositionAt(this.terminal.pos.x, this.factory.pos.y);
    }

    if (this.terminal && this.factory) {
      return this.getPositionAt((this.terminal.pos.x + this.factory.pos.x) >> 1,
        (this.terminal.pos.y + this.factory.pos.y) >> 1);
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});