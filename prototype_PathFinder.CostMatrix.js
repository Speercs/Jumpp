'use strict';

PathFinder.CostMatrix.prototype.hasAdjacentTile = function(x, y, types) {
	return this.hasTileInRange(x, y, 1, types);
}

PathFinder.CostMatrix.prototype.hasTileInRange = function(x, y, range, types) {
	for (let dy = -range; dy < range+1; dy++) {
		if (y+dy < 0 || y+dy > ROOM_HEIGHT-1) {
			continue;
		}
		for (let dx = -range; dx < range+1; dx++) {
			if (x+dx < 0 || x+dx > ROOM_WIDTH-1) {
				continue;
			}
			if (types.includes(this.get(x+dx, y+dy))) {
				return true;
			}
		}
	}
	
	return false;
}

PathFinder.CostMatrix.prototype.increment = function(x, y) {
	return this.set(x, y, this.get(x, y) + 1);
}