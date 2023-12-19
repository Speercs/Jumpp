'use strict';

Object.defineProperty(StructureInvaderCore.prototype, 'invulnerability', {
  get: function() {
    let effect = _.find(this.effects, e => e.effect == EFFECT_INVULNERABILITY);

    return (effect && effect.ticksRemaining) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

