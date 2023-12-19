'use strict';


function initializeUnit(unitId) {
    let unitType = /[A-Za-z]*/.exec(unitId)[0];
    Game.units[unitId] = {
        id: unitId,
        elements: [],
        memory: Memory[unitType + 's'][unitId]};
}

module.exports = {
    initializeUnit,
}