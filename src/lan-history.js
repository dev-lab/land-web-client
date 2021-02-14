/*
 Copyright (c) 2021 Taras Greben <taras.greben@gmail.com> LAND.eTaras.com. All rights Reserved.
*/

const toDate = value => ((typeof value === 'string') ? new Date(value) : value);

const lanHistory = (() => {

	const NAME = "lanDetectionHistory";
	let _db = null;
	let _locations = {};
	let _subnets = {};
	let _rlCounter = 0;

	const load = () => {
		let db = localStorage.getItem(NAME);
		try {
			if(db) {
				_db = JSON.parse(db);
				_locations = {};
				_db.locations.forEach((l, i) => _locations[l.ip] = i);
				_subnets = {};
				_db.subnets.forEach((s, i) => _subnets[s] = i);
			}
		} catch(e) {
			console.error(e);
			_db = null;
		}
		if(!_db) {
			_db = {
				locations : [],
				subnets : [],
				sessions : []
			};
			_locations = {};
			_subnets = {};
		}
	};

	const initialize = () => {
		if(!_db) load();
	};

	const save = () => {
		localStorage.setItem(NAME, JSON.stringify(_db));
	};


	const resolveLocation = (location, callback) => {
		new Promise((resolve, reject) => {
			const id = "_" + ++_rlCounter;
			const thunk = "resolve_location" + id;
			window[thunk] = data => {
				delete window[thunk];
				const el = document.getElementById(id);
				el.parentNode.removeChild(el);
				resolve(data);
			};
			const src = "https://get.geojs.io/v1/ip/geo" + (location.ip ? ("/" + location.ip) : "")
				+ ".js?callback=" + thunk;
			const sEl = document.createElement('script');
			sEl.src = src;
			sEl.id = id;
			sEl.addEventListener("error", reject);
			(document.getElementsByTagName('head')[0] || document.body || document.documentElement).appendChild(sEl);
		}).then(data => {
			location.ip = data.ip;
			location.latitude = data.latitude;
			location.longitude = data.longitude;
			location.city = data.city;
			location.region = data.region;
			location.country = data.country;
			location.continent = data.continent_code;
			location.timeZone = data.timezone;
			location.org = data.organization_name;
			location.asn = data.asn;
			location.accuracy = data.accuracy;
			location.source = "https://geojs.io/";
			location.timestamp = new Date();
			location.label = location.ip;
			let id = _locations[location.ip];
			if(null == id) {
				id = _db.locations.push(location) - 1;
				_locations[location.ip] = id;
			} else {
				location.label = _db.locations[id].label;
				_db.locations[id] = location;
			}
			callback(id);
		}).catch(reason => {
			console.error(reason);
			callback(null);
		});
	};

	const findLocationId = (publicIp, callback) => {
		let id = publicIp ? _locations[publicIp] : null;
		if(null == id) {
			const result = {
				ip : publicIp,
				label : (publicIp ? publicIp : "Unknown")
			}
			resolveLocation(result, callback);
		} else {
			callback(id);
		}
	};

	const getSubnetId = ip => {
		let id = _subnets[ip];
		if(null == id) {
			id = _db.subnets.push(ip) - 1;
			_subnets[ip] = id;
		}
		return id;
	};

	const fromInner = session => {
		const result = Object.assign({}, session);
		result.location = _db.locations[session.location];
		result.subnet = _db.subnets[session.subnet];
		result.getIp = () => {
			return (result.location && result.location.ip) ? result.location.ip : "Uknown IP";
		};
		return result;
	};

	const toInner = (session, locationCallback) => {
		const result = Object.assign({}, session);
		result.subnet = getSubnetId(session.subnet);
		result.location = null;
		findLocationId(session.location, id => {
			result.location = id;
			save();
			if(locationCallback) locationCallback(_db.locations[id]);
		});
		return result;
	};

	initialize();

	return {
		forEach : (callback, scope) => {
			_db.sessions.forEach( (v, i) => callback.call(scope, fromInner(v), i));
		},

		get length() {
			return _db.sessions.length;
		},

		at : index => {
			return fromInner(_db.sessions[index]);
		},

		add : (session, locationCallback) => {
			const i = _db.sessions.unshift(toInner(session, locationCallback));
			return i;
		},

		setLocationLabel : (ip, label) => {
			const id = _locations[ip];
			if(null == id) return false;
			_db.locations[id].label = label;
			save();
			return true;
		},

		getSubnets : ip => {
			const result = [];
			const found = {};
			const ipi = ip ? _locations[ip] : null;
			_db.sessions.forEach(i => {
				if(null == ipi || i.location == ipi) {
					if(!found[i.subnet]) {
						const s = _db.subnets[i.subnet];
						found[i.subnet] = s;
						result.push(s);
					}
				}
			});
			_db.subnets.forEach(s => {
				if(!found[s]) result.push(s);
			});
			return result;
		},

		addEmptySubnet : subnet => {
			if(!_db.emptySubnets) _db.emptySubnets = [];
			const found = _db.emptySubnets.find(s => s == subnet);
			if(found) return false;
			_db.emptySubnets.push(subnet);
			save();
			return true;
		},

		getEmptySubnets : () => {
			return _db.emptySubnets ? Array.from(_db.emptySubnets) : [];
		}

	};
})();
