'use strict';

class SiegeMap {
	constructor(room) {
		let response;
		response = generateSiegeMap(room);

		this.wallCount = room.constructedWalls.length;
		this.rampartCount = room.ramparts.length;

		this.exposedTiles = response.exposedTiles;
		this.interiorTiles = response.interiorTiles;
		this.criticalTiles = response.criticalTiles;
		this.criticalWalls = response.criticalWalls;
		this.keepRamparts = response.keepRamparts;
		this.galleries = response.galleries;
		this.onRamps = response.onRamps;
		this.stubRamparts = response.stubRamparts;
	
		this.exposedBunkerTiles = _.filter(response.exposedTiles, 'isBunkerTile');
		this.interiorBunkerTiles = _.filter(response.interiorTiles, 'isBunkerTile');

		this.roomMatrix = response.siegeMap;
	};
}
	
function generateSiegeMap(room) {
	// Make a fresh map. Then loop once over the entire map, marking each tile as
	// either TILE_NATURAL_WALL, TILE_RAMPART, TILE_WALL, or TILE_UNKNOWN.
	let siegeMap = new PathFinder.CostMatrix;
	const terrain = new Room.Terrain(room.name);

	// Set initial states (TILE_RAMPART, TILE_WALL, TILE_UNKNOWN, TILE_NATURAL_WALL)
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			switch(terrain.get(x, y)) {
				case 0:
				case TERRAIN_MASK_SWAMP:
					let structures = room.lookForAt(LOOK_STRUCTURES, x, y);
					if (_.filter(structures, s => s.structureType == STRUCTURE_RAMPART).length) {
						siegeMap.set(x, y, TILE_RAMPART);
					} else if (_.filter(structures, (s) => s.structureType == STRUCTURE_WALL).length) {
						siegeMap.set(x, y, TILE_WALL);
					} else {
						siegeMap.set(x, y, TILE_UNKNOWN);
					}
					break;
				case TERRAIN_MASK_WALL:
					siegeMap.set(x, y, TILE_NATURAL_WALL);
					break;
			}
		}
	}

	// Ignore tiles we've been told to ignore.
	if (room.memory.siegeMapIgnoreTiles && room.memory.siegeMapIgnoreTiles.length) {
		for (let ignore of room.memory.siegeMapIgnoreTiles) {
			siegeMap.set(ignore.x, ignore.y, TILE_UNKNOWN);
		}
	}

	// Mark unsecured edges as EXTERIOR.
	let unsecuredEdges = room.unsecuredEdges();

	for (let key in unsecuredEdges) {
		// 'key' is equivalent to FIND_EXIT_[direction]
		let exits = room.find(parseInt(key));
		for (let i=0; i < exits.length; i++) {
			siegeMap.set(exits[i].x, exits[i].y, TILE_EXTERIOR);
		}
	}

	// Mark a few interior starting positions as TILE_INTERIOR, or TILE_KEEP if there's a rampart.
	if (room.storage) {
		siegeMap.set(room.storage.pos.x,
				room.storage.pos.y,
				room.storage.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	if (room.terminal) {
		siegeMap.set(room.terminal.pos.x,
				room.terminal.pos.y,
				room.terminal.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	if (room.powerSpawn) {
		siegeMap.set(room.powerSpawn.pos.x,
				room.powerSpawn.pos.y,
				room.powerSpawn.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	if (room.invaderCore) {
		siegeMap.set(room.invaderCore.pos.x,
				room.invaderCore.pos.y,
				room.invaderCore.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	for (let i=0; i < room.towers.length; i++) {
		let tower = room.towers[i];
		siegeMap.set(tower.pos.x, tower.pos.y, tower.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	for (let i=0; i < room.spawns.length; i++) {
		let spawn = room.spawns[i];
		siegeMap.set(spawn.pos.x, spawn.pos.y, spawn.naked ? TILE_INTERIOR : TILE_KEEP);
	}

	// Flood fill, spreading KEEP, INTERIOR, and EXTERIOR from their starting sets.
	let changes;
	let sense = true;
	do {
		changes = doPrimaryFloodFillPass(siegeMap, sense);
		sense = !sense;
	} while (changes);
	
	// Catch tiles that didn't get flooded, and mark interior tiles that are vulnerable to fire
	// from exterior tiles as EXPOSED.
	doFinalPasses(siegeMap);

	markCriticalWalls(siegeMap, room);

	let response = classifyWalls(siegeMap, room);
	response.siegeMap = siegeMap;
	return response;
}

function doPrimaryFloodFillPass(siegeMap, reverse) {
	// Loop once over the entire map. For each tile, look at all neighbors:
	// - any RAMPART tile bordering a KEEP tile becomes KEEP
	// - any UNKNOWN tile bordering KEEP or INTERIOR becomes INTERIOR
	// - any UNKNOWN tile bordering EXTERIOR becomes EXTERIOR
	// - any INTERIOR tile bordering EXTERIOR becomes EXTERIOR.

	function updateUnknownTile(x,y) {
		let done = false;
		for (let dy = -1; !done && dy < 2; dy++) {
			if (y+dy < 0 || y+dy > ROOM_HEIGHT-1) {
				continue;
			}
			for (let dx = -1; !done && dx < 2; dx++) {
				if (x+dx < 0 || x+dx > ROOM_WIDTH-1) {
					continue;
				}
				switch (siegeMap.get(x+dx, y+dy)) {
					case TILE_INTERIOR:
					case TILE_KEEP:
						siegeMap.set(x, y, TILE_INTERIOR);
						done = true;
						changes++;
						break;
					case TILE_EXTERIOR:
						siegeMap.set(x, y, TILE_EXTERIOR);
						done = true;
						changes++;
						break;
					default:
						break;
				}
			}
		}
	}

	function updateRampartTile(x,y) {
		let done = false;
		for (let dy = -1; !done && dy < 2; dy++) {
			if (y+dy < 0 || y+dy > ROOM_HEIGHT-1) {
				continue;
			}
			for (let dx = -1; !done && dx < 2; dx++) {
				if (x+dx < 0 || x+dx > ROOM_WIDTH-1) {
					continue;
				}
				switch (siegeMap.get(x+dx, y+dy)) {
					case TILE_KEEP:
						siegeMap.set(x, y, TILE_KEEP);
						done = true;
						changes++;
						break;
					default:
						break;
				}
			}
		}
	}
	
	function updateInteriorTile(x,y) {
		let done = false;
		for (let dy = -1; !done && dy < 2; dy++) {
			if (y+dy < 0 || y+dy > ROOM_HEIGHT-1) {
				continue;
			}
			for (let dx = -1; !done && dx < 2; dx++) {
				if (x+dx < 0 || x+dx > ROOM_WIDTH-1) {
					continue;
				}
				switch (siegeMap.get(x+dx, y+dy)) {
					case TILE_EXTERIOR:
						siegeMap.set(x, y, TILE_EXTERIOR);
						done = true;
						changes++;
						break;
					default:
						break;
				}
			}
		}
	}
	
	function updateTile(x,y) {
		switch (siegeMap.get(x, y)) {
			case TILE_UNKNOWN:
				updateUnknownTile(x,y);
				break;
			case TILE_RAMPART:
				updateRampartTile(x,y);
				break;
			case TILE_INTERIOR:
				updateInteriorTile(x,y);
				break;
			default:
				break;
		}
	}

	let changes = 0;
	if (reverse) {
		for (let y = ROOM_HEIGHT-1; y >= 0; y--) {
			for (let x = ROOM_WIDTH-1; x >= 0; x--) {
				updateTile(x,y);
			}
		}
	} else {
		for (let y = 0; y < ROOM_HEIGHT; y++) {
			for (let x = 0; x < ROOM_WIDTH; x++) {
				updateTile(x,y);
			}
		}
	}

	return changes;
}
	
// Loop twice over the entire map:
// First pass: Any UNKNOWN tile becomes EXTERIOR.
// Second pass: any INTERIOR within 3 of an EXTERIOR tile becoems EXPOSED.
function doFinalPasses(siegeMap) {
	function updateInteriorTile(x,y) {
		let done = false;
		for (let dy = -3; !done && dy < 4; dy++) {
			if (y+dy < 0 || y+dy > ROOM_HEIGHT-1) {
				continue;
			}
			for (let dx = -3; !done && dx < 4; dx++) {
				if (x+dx < 0 || x+dx > ROOM_WIDTH-1) {
					continue;
				}
				switch (siegeMap.get(x+dx, y+dy)) {
					case TILE_EXTERIOR:
						siegeMap.set(x, y, TILE_EXPOSED);
						done = true;
						break;
					default:
						break;
				}
			}
		}
	}

	for (let y = ROOM_HEIGHT-1; y >= 0; y--) {
		for (let x = ROOM_WIDTH-1; x >= 0; x--) {
			if (siegeMap.get(x, y) == TILE_UNKNOWN) {
				siegeMap.set(x, y, TILE_EXTERIOR);
			}
		}
	}

	for (let y = ROOM_HEIGHT-1; y >= 0; y--) {
		for (let x = ROOM_WIDTH-1; x >= 0; x--) {
			if (siegeMap.get(x, y) == TILE_INTERIOR) {
				updateInteriorTile(x,y);
			}
		}
	}
}
	
function draw(roomName, siegeMap) {
	let visual = new RoomVisual(roomName);

	let t0 = Game.cpu.getUsed();
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let opts = {};
			switch (siegeMap.get(x, y)) {
				case TILE_CRITICAL_WALL:
					opts.fill = 'blue';
					break;
				case TILE_EXTERIOR:
					opts.fill = 'red';
					break;
				case TILE_ONRAMP:
					opts.fill = 'green';
					break;
				case TILE_EXPOSED:
					opts.fill = 'orange';
					break;
				case TILE_WALL:
				case TILE_RAMPART:
					opts.fill = 'white';
					break;
				default:
					continue;
			}
			visual.rect(x-0.5, y-0.5, 1, 1, opts);
		}
	}
	let t1 = Game.cpu.getUsed();

	let results = new String('drawn in ' + (t1-t0) + ' CPUs.');
	return results;
}

// Any TILE_WALL or TILE_RAMPART that's adjacent to a TILE_EXTERIOR and either
// of TILE_INTERIOR and TILE_EXPOSED becomes TILE_CRITICAL_WALL.
function markCriticalWalls(siegeMap, room) {
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			if ([TILE_WALL, TILE_RAMPART].includes(siegeMap.get(x, y)) &&
				siegeMap.hasAdjacentTile(x, y, [TILE_EXTERIOR]) &&
				siegeMap.hasAdjacentTile(x, y, [TILE_INTERIOR, TILE_EXPOSED])) {
				siegeMap.set(x, y, TILE_CRITICAL_WALL);
			}
		}
	}
}

/**
 * Any TILE_RAMPART that is adjacent to an EXTERIOR tile becomes TILE_GALLERY.
 * Any TILE_RAMPART that is:
 *   - Adjacent to a TILE_CRITICAL_WALL or TILE_RAMPART, and
 *   - Adjacent to an TILE_INTERIOR or TILE_EXPOSED, and
 *   - Within 3 of an TILE_EXTERIOR
 *   becomes an ONRAMP.
 * Any TILE_KEEP that is adjacent to a TILE_EXTERIOR becomes TILE_CRITICAL.
 * Any TILE_KEEP that doesn't protect an IMPORTANT_STRUCTURE becomes TILE_ONRAMP.
 * Any TILE_WALL that is adjacent to both a TILE_EXTERIOR and a
 *   TILE_CRITICAL_WALL becomes a TILE_NARROWER.
 * Any TILE_WALL that is adjacent to a TILE_EXTERIOR and not to a
 *   TILE_CRITICAL_WALL becomes a TILE_LENGTHENER.
 * 
 * Final pass:
 * Any TILE_KEEP, TILE_GALLERY or TILE_ONRAMP that's adjacent to a room
 *   controller becomes TILE_CRITICAL.
 * Any TILE_RAMPART or TILE_WALL becomes TILE_STUB.
 * 
 * Returns an object with two members:
 *   interiorTiles: An array of RoomPositions of all the room's INTERIOR tiles.
 *   exposedTiles: An array of RoomPositions of all the room's EXPOSED tiles.
 **/
function classifyWalls(matrix, room) {
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let tileType = matrix.get(x, y);
			if (tileType == TILE_RAMPART) {
				if (matrix.hasAdjacentTile(x, y, [TILE_EXTERIOR])) {
					matrix.set(x, y, TILE_GALLERY);
					continue;
				}
				
				let pos = room.getPositionAt(x, y);
				let stuff = _.map(pos.lookFor(LOOK_STRUCTURES), 'structureType');
				if (_.intersection(stuff, IMPORTANT_STRUCTURES).length) {
					matrix.set(x, y, TILE_KEEP);
					continue;
				}
				
				if (matrix.hasAdjacentTile(x, y, [TILE_CRITICAL_WALL, TILE_RAMPART]) &&
					matrix.hasAdjacentTile(x ,y, [TILE_INTERIOR, TILE_EXPOSED]) &&
					matrix.hasTileInRange(x, y, 3, [TILE_EXTERIOR])) {
					matrix.set(x, y, TILE_ONRAMP);
				}
			} else if (tileType == TILE_KEEP) {
				if (matrix.hasAdjacentTile(x, y, [TILE_EXTERIOR])) {
					matrix.set(x, y, TILE_CRITICAL_WALL);
					continue;
				}

				let pos = room.getPositionAt(x, y);
				let stuff = _.map(pos.lookFor(LOOK_STRUCTURES), 'structureType');
				if (!_.intersection(stuff, IMPORTANT_STRUCTURES).length) {
					matrix.set(x, y, TILE_ONRAMP);
				}
			} else if (tileType == TILE_WALL && matrix.hasAdjacentTile(x, y, [TILE_EXTERIOR])) {
				if (matrix.hasAdjacentTile(x, y, [TILE_CRITICAL_WALL])) {
					matrix.set(x, y, TILE_NARROWER);
				} else {
					matrix.set(x, y, TILE_LENGTHENER);
				}
			}
		}
	}
	
	if (room.controller) {
		for (let dy = -1; dy < 2; dy++) {
			for (let dx = -1; dx < 2; dx++) {
				let x = room.controller.pos.x + dx;
				let y = room.controller.pos.y + dy;
				if ([TILE_RAMPART, TILE_KEEP, TILE_ONRAMP, TILE_GALLERY].includes(matrix.get(x, y))) {
					matrix.set(x, y, TILE_CRITICAL_WALL);
				}
			}
		}
	}

	let response = {
		exposedTiles: [],
		interiorTiles: [],
		criticalTiles: [],
		criticalWalls: [],
		keepRamparts: [],
		galleries: [],
		onRamps: [],
		stubRamparts: []
	};
	
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let thisTile = matrix.get(x, y);
			if ([TILE_RAMPART, TILE_WALL].includes(thisTile)) {
				matrix.set(x, y, TILE_STUB);
				let structures = room.getPositionAt(x, y).lookFor(LOOK_STRUCTURES);
				let wall = _.find(structures, {structureType: STRUCTURE_RAMPART});
				if (wall) {
					response.stubRamparts.push(wall.id);
				}
			} else if (thisTile == TILE_EXPOSED) {
				response.exposedTiles.push(room.getPositionAt(x, y));
			} else if (thisTile == TILE_INTERIOR) {
				response.interiorTiles.push(room.getPositionAt(x, y));
			} else if (thisTile == TILE_CRITICAL_WALL) {
				let pos = room.getPositionAt(x, y);
				response.criticalTiles.push(pos);
				let structures = pos.lookFor(LOOK_STRUCTURES);
				let wall = _.find(
					structures,
					s => [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType));
				if (wall) {
					response.criticalWalls.push(wall.id);
				}
			} else if (thisTile == TILE_KEEP) {
				let structures = room.getPositionAt(x, y).lookFor(LOOK_STRUCTURES);
				let wall = _.find(structures, {structureType: STRUCTURE_RAMPART});
				if (wall) {
					response.keepRamparts.push(wall.id);
				}
			} else if (thisTile == TILE_GALLERY) {
				let structures = room.getPositionAt(x, y).lookFor(LOOK_STRUCTURES);
				let wall = _.find(structures, {structureType: STRUCTURE_RAMPART});
				if (wall) {
					response.galleries.push(wall.id);
				}
			} else if (thisTile == TILE_ONRAMP) {
				let structures = room.getPositionAt(x, y).lookFor(LOOK_STRUCTURES);
				let wall = _.find(structures, {structureType: STRUCTURE_RAMPART});
				if (wall) {
					response.onRamps.push(wall.id);
				}
			}
		}
	}

	return response;
}

Room.prototype.drawSiegeMap = function () {
	let t0 = Game.cpu.getUsed();
	draw(this.name, this.siegeMap);
	return Game.cpu.getUsed() - t0;
};

Room.prototype.drawWallMap = function() {
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let opts = {};
			switch (this.siegeMap.roomMatrix.get(x, y)) {
				case TILE_WALL:
					opts.fill = 'orange';
					break;
				case TILE_ONRAMP:
					opts.fill = 'green';
					break;
				case TILE_GALLERY:
					opts.fill = 'yellow';
					break;
				case TILE_CRITICAL_WALL:
					opts.fill = 'BLUE';
					break;
				case TILE_NATURAL_WALL:
					opts.fill = 0x808080;
					break;
				default:
					break;
			}
			this.visual.rect(x-0.5, y-0.5, 1, 1, opts);
		}
	}
}

/**
 * Key is room name. Value is an object with fields:
 *   siegeMap: A CostMatrix with the tile values for each tile in the room.
 *   - exposedTiles: An array of RoomPositions of all EXPOSED tiles in the room.
 *   - interiorTiles: An array of RoomPositions of all INTERIOR tiles in the room.
 *   - exposedBunkerTiles: The subset of exposedTiles that lie within the bunker footprint, if the
 *     room is a bunker, or an empty array otherwise.
 *   - interiorBunkerTiles: The subset of interiorTiles that lie within the bunker footprint, if
 *     the room is a bunker, or an empty array otherwise.
 *   - rampartCount: The number of ramparts in the room when the map was generated.
 *   - wallCount: The number of walls in the room when the map was generated.
 */
let siegeMaps = {};

Room.prototype._checkSiegeMapCache = function() {
	if (siegeMaps[this.name] &&
		siegeMaps[this.name].wallCount == this.constructedWalls.length &&
		siegeMaps[this.name].rampartCount == this.ramparts.length) {
		return true;
	}

	siegeMaps[this.name] = new SiegeMap(this);
}

global.drawSiegeMap = function(roomName) {
	let t0 = Game.cpu.getUsed();
	let siegeMap = (siegeMaps[roomName] && siegeMaps[roomName].roomMatrix) ||
				   (Game.rooms[roomName] && Game.rooms[roomName].siegeMap);
	if (siegeMap) {
		draw(roomName, siegeMap);
	} else {
		console.log(`No siege map exists for ${roomName}`);
	}
	return Game.cpu.getUsed() - t0;
}
	
Room.prototype.resetSiegeMap = function() {
	delete siegeMaps[this.name];
}

Room.prototype.blockUnsafeTiles = function(matrix) {
	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
			let tile = this.siegeMap.get(x, y);
			if (tile == TILE_EXTERIOR) {
				matrix.set(x, y, 0xff);
			} else if (tile == TILE_EXPOSED) {
				matrix.set(x, y, 8);
			}
		}
	}
}

Object.defineProperty(Room.prototype, 'criticalTiles', {
	get: function() {
		if (this._checkSiegeMapCache() && this._criticalTiles) {
			return this._criticalTiles;
		} else if (siegeMaps[this.name]) {
			return this._criticalTiles = siegeMaps[this.name].criticalTiles;
		} else {
			return this._criticalTiles = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'criticalWalls', {
	get: function() {
		if (this._checkSiegeMapCache() && this._criticalWalls) {
			return this._criticalWalls;
		} else if (siegeMaps[this.name]) {
			return this._criticalWalls = _.compact(siegeMaps[this.name].criticalWalls.map(Game.getObjectById));
		} else {
			return this._criticalWalls = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'weakestCriticalWall', {
	get: function() {
		if (this._weakestCriticalWall) {
			return this._weakestCriticalWall;
		} else if (this.nukes.length) {
			return this._weakestCriticalWall = _.min(this.criticalWalls, 'effectiveHits');
		} else {
			return this._weakestCriticalWall = _.min(this.criticalWalls, 'hits');
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'keepRamparts', {
	get: function() {
		if (this._checkSiegeMapCache() && this._keepRamparts) {
			return this._keepRamparts;
		} else if (siegeMaps[this.name]) {
			return this._keepRamparts = _.compact(siegeMaps[this.name].keepRamparts.map(Game.getObjectById));
		} else {
			return this._keepRamparts = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'weakestKeepRampart', {
	get: function() {
		if (this._weakestKeepRampart) {
			return this._weakestKeepRampart;
		} else if (this.nukes.length) {
			return this._weakestKeepRampart = _.min(this.keepRamparts, 'effectiveHits');
		} else {
			return this._weakestKeepRampart = _.min(this.keepRamparts, 'hits');
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'galleries', {
	get: function() {
		if (this._checkSiegeMapCache() && this._galleries) {
			return this._galleries;
		} else if (siegeMaps[this.name]) {
			return this._galleries = _.compact(siegeMaps[this.name].galleries.map(Game.getObjectById));
		} else {
			return this._galleries = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'weakestGallery', {
	get: function() {
		if (this._weakestGallery) {
			return this._weakestGallery;
		} else if (this.nukes.length) {
			return this._weakestGallery = _.min(this.galleries, 'effectiveHits');
		} else {
			return this._weakestGallery = _.min(this.galleries, 'hits');
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'onRamps', {
	get: function() {
		if (this._checkSiegeMapCache() && this._onRamps) {
			return this._onRamps;
		} else if (siegeMaps[this.name]) {
			return this._onRamps = _.compact(siegeMaps[this.name].onRamps.map(Game.getObjectById));
		} else {
			return this._onRamps = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'weakestOnRamp', {
	get: function() {
		if (this._weakestOnRamp) {
			return this._weakestOnRamp;
		} else if (this.nukes.length) {
			return this._weakestOnRamp = _.min(this.onRamps, 'effectiveHits');
		} else {
			return this._weakestOnRamp = _.min(this.onRamps, 'hits');
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'stubRamparts', {
	get: function() {
		if (this._checkSiegeMapCache() && this._stubRamparts) {
			return this._stubRamparts;
		} else if (siegeMaps[this.name]) {
			return this._stubRamparts = _.compact(siegeMaps[this.name].stubRamparts.map(Game.getObjectById));
		} else {
			return this._stubRamparts = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'weakestStubRampart', {
	get: function() {
		if (this._weakestStubRampart) {
			return this._weakestStubRampart;
		} else if (this.nukes.length) {
			return this._weakestStubRampart = _.min(this.stubRamparts, 'effectiveHits');
		} else {
			return this._weakestStubRampart = _.min(this.stubRamparts, 'hits');
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'exposedTiles', {
	get: function() {
		if (this._checkSiegeMapCache() && this._exposedTiles) {
			return this._exposedTiles;
		} else if (siegeMaps[this.name]) {
			return this._exposedTiles = siegeMaps[this.name].exposedTiles;
		} else {
			return this._exposedTiles = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'exposedBunkerTiles', {
	get: function() {
		if (this._checkSiegeMapCache() && this._exposedBunkerTiles) {
			return this._exposedBunkerTiles;
		} else if (siegeMaps[this.name]) {
			return this._exposedBunkerTiles = siegeMaps[this.name].exposedBunkerTiles;
		} else {
			return this._exposedBunkerTiles = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'interiorTiles', {
	get: function() {
		if (this._checkSiegeMapCache() && this._interiorTiles) {
			return this._interiorTiles;
		} else if (siegeMaps[this.name]) {
			return this._interiorTiles = siegeMaps[this.name].interiorTiles;
		} else {
			return this._interiorTiles = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'interiorBunkerTiles', {
	get: function() {
		if (this._checkSiegeMapCache() && this._interiorBunkerTiles) {
			return this._interiorBunkerTiles;
		} else if (siegeMaps[this.name]) {
			return this._interiorBunkerTiles = siegeMaps[this.name].interiorBunkerTiles;
		} else {
			return this._interiorBunkerTiles = [];
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(Room.prototype, 'siegeMap', {
	get: function() {
		if (this._checkSiegeMapCache() && this._siegeMap) {
			return this._siegeMap;
		} else if (siegeMaps[this.name]) {
			return this._siegeMap = siegeMaps[this.name].roomMatrix;
		} else {
			return this._siegeMap = undefined;
		}
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

function getSiegeMapImpl(roomName) {
	if (Game.rooms[roomName]) {
		return Game.rooms[roomName].siegeMap;
	}

	// No-visibility case. Not likely to exist unless we've previously called this when we did
	// have visibility.
	return siegeMaps[roomName] && siegeMaps[roomName].roomMatrix;
}

global.getSiegeMap = function(roomName) {
	return getSiegeMapImpl(roomName);
}