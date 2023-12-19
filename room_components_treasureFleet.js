'use strict';

let lastMessage = 0;

exports.update = function(room) {
    return; // hax!
    // Look for treasure fleets.
    // Specifically: Look for units owned by 'Screeps' that carry XGH2O.
    let candidates = _.filter(
        room.hostileCreeps, c => c.owner.username == 'Screeps');
        
    if (!candidates.length) {
        return;
    }
    
    if (lastMessage + 10 > Game.time) {
        return;
    }
    
    lastMessage = Game.time;

    let engines = _.filter(
        candidates,
        c => c.owner.username == 'Screeps' && c.getActiveBodyparts(ATTACK) > 20);
    let healers = _.filter(
        candidates,
        c => c.owner.username == 'Screeps' && c.getActiveBodyparts(HEAL) > 20);
    let treasureCars = _.filter(
        candidates, c => c.owner.username == 'Screeps' && c.store.XGH2O);
    let guards = _.filter(
        candidates,
        c => c.owner.username == 'Screeps' && c.getActiveBodyparts(RANGED_ATTACK) > 15);

    if (treasureCars.length) {
        room.logError('treasure fleet!');
    }
    
    if (engines.length &&
        treasureCars.length &&
        engines[0].hits == engines[0].hitsMax &&
        treasureCars[0].hits == treasureCars[0].hitsMax) {
        let directionOfTravel = treasureCars[0].pos.getDirectionTo(engines[0]);
        room.logError('direction of travel = ' + directionOfTravel);
    }
    
    room.logError(`${engines.length} engines, ${healers.length} healers, ${treasureCars.length} treasure cars, and ${guards.length} guards`);
}