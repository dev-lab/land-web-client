/*
 Copyright (c) 2021 Taras Greben <taras.greben@gmail.com> LAND.eTaras.com. All rights Reserved.
*/

const sleep = ms => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

const socketFactory = (() => {

	let _opened = 0;
	let _closed = 0;
	let _maxSockets = 100;
	let _maxDelay = 0;

	const opened = () => _opened - _closed;
	const available = () => _maxSockets - opened();

	return {
		getOpened : () => opened(),
		getTested : () => _closed,
		getAvailable : () => available(),
		getMaxSockets : () => _maxSockets,
		getMaxDelay : () => _maxDelay,

		setMaxSockets : (value) => {
			_maxSockets = value;
		},

		create : async (ctx, onStart, onFinish) => {

			let onClose = (socket, result) => {
				socket.ctx.end = performance.now();
				socket.ctx.delay = Math.floor(socket.ctx.end - socket.ctx.start);
				if(socket.ctx.delay > _maxDelay) _maxDelay = socket.ctx.delay;
				socket.ctx.result = result;
				try {
					onFinish(socket.ctx);
				} catch (e) {
					// console.error(e);
				}
				++_closed;
			};

			while(available() <= 0) await sleep(500);

			++_opened;
			if(onStart) onStart(ctx);
			let s = new WebSocket("wss://" + ctx.ip + ":" + ctx.port);
			ctx.start = performance.now();
			s.ctx = ctx;
			s.onerror = function(err) {
				onClose(this, false);
			};
			s.onopen = function(evt) {
				onClose(this, true);
			};
		},

		complete : async () => {
			while(opened() > 0) await sleep(500);
		}
	};
})();

const landPass = (() => {

	const RND_NAME = "landRnd";

	let _token = null;
	let _rnd = null;
	let _error = null;
	let _initialized = false;

	const _load = () => {
		_rnd = localStorage.getItem(RND_NAME);
	};

	const _save = () => {
		localStorage.setItem(RND_NAME, _rnd);
	};

	const _request = () => {
		const request = {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			}
		};
		if(_rnd) request.body = "rnd=" + _rnd;
		fetch("/auth/checkin", request).then(response => {
			if(!response.ok) {
				throw response.status + (response.statusText ? (": " + response.statusText) : "");
			}
			return response.json();
		}).then(response => {
			_token = response.access_token;
			_rnd = response.scope.split(" ").find(s => s.startsWith("rnd:")).substring(4);
			_save();
		}).catch(error => _error = error);
	};

	const _init = () => {
		if(_initialized) return false;
		_initialized = true;
		_request();
		return true;
	};

	_load();

	return {
		init : () => _init(),
		getRnd : () => _rnd,
		getToken : () => _token,
		getError : () => _error
	};

})();

async function scanNetwork(ports, candidates, createIp, onStart, onFinish) {
	const resTemplate = ports.map(p => new Object());
	const maxPortIdx = ports.length - 1;
	const result = candidates.map(v => {
		return {
			ipPart : v,
			ip : createIp(v),
			results : resTemplate.slice()
		};
	});
	const toProcess = candidates.map(c => ({busy : false, portIdx : -1}));
	let left = candidates.length * ports.length;
	let leftToStart = left;
	let cancel = false;

	const onClose = ctx => {
		try {
			if(true == onFinish(ctx)) {
				cancel = true;
				console.info("Execution interrupded when scanning " + ctx.ip + " in " + ctx.delay + " ms");
			}
		} catch (e) {
			// console.error(e);
		}
		result[ctx.ipIdx].results[ctx.portIdx] = { delay : ctx.delay };
		toProcess[ctx.ipIdx].busy = (ctx.portIdx >= maxPortIdx);
		--left;
		return cancel;
	};

	do {
		let started = 0;
		for(let c = 0; c < toProcess.length; ++c) {
			if(cancel) break;
			if(toProcess[c].busy) continue;
			--leftToStart;
			++started;
			toProcess[c].busy = true;
			let portIdx = ++toProcess[c].portIdx;
			let res = result[c];
			let ctx = {
				ipIdx : c,
				ipPart : res.ipPart,
				ip : res.ip,
				portIdx : portIdx,
				port : ports[portIdx]
			};
			await socketFactory.create(ctx, onStart, onClose);
		}
		if(!cancel && started == 0) await sleep(500);
	} while(leftToStart > 0 && !cancel);
	while(!cancel && left > 0) await sleep(500);
	return result;
}

async function findFirstNetwork(ports, candidates, createIp, onStart, onFinish, checkAll) {
	const ENOUGH = checkAll ? 4200 : 42;
	let min = 1000000;
	let result = [];
	const onClose = ctx => {
		try {
			if(true == onFinish(ctx)) return true;
		} catch (e) {
			// console.error(e);
		}
		let delay = ctx.delay;
		result.push(delay);
		if(delay < min) min = delay;
		if(result.length > ENOUGH) {
			if(min < 3000) return true;
			if(min < 4000) {
				if(result.sort((a,b) => a-b)[1] / min > 3) return true;
			}
		}
		return false;
	};
	return scanNetwork(ports, candidates, createIp, onStart, onClose);
}

function getDelay(obj) {
	return !(obj.delay) ? 1000000 : obj.delay;
}

function sortNetworkScanResult(result) {
	return result.map((v, i) => {
		return {
			delay : (v.results.reduce((a, b) => getDelay(a) < getDelay(b) ? a : b)).delay,
			ipIdx : i
		};
	}).sort((a, b) => getDelay(a) - getDelay(b));
}

async function analyzeNetworkScanResult(local, result) {
	const pCount = result[0].results.length;
	const d = sortNetworkScanResult(result);
	const request = {local: local, probes: d.map(v => v.delay)};
	const response = await fetch("/api/land", {
		method: "POST",
		body: JSON.stringify(request),
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Bearer " + landPass.getToken()
		}
	});
	if(!response.ok) {
		console.error("Can't analyze network scan results: " + response.status);
		throw response.status;
	}
	const j = await response.json();
	j.results.forEach((v, id) => {
		if(v > 0 && v < 2) {
			const r = result[d[id].ipIdx];
			r.results.forEach(rr => rr.poi = v);
		}
	});
	return result;
}

async function scanHost(ports, ip, parallel, onStart, onFinish) {
	const result = ports.map(p => {
		return {
			port : p,
			delay : 0
		};
	});

	let busy = false;
	if(parallel) {
		while(socketFactory.available() < (ports.length + 1)) {
			await sleep(500);
		}
	}

	const onClose = ctx => {
		try {
			onFinish(ctx);
		} catch (e) {
			// console.error(e);
		}
		result[ctx.portIdx].delay = ctx.delay;
		busy = false;
	};

	for(let p = 0; p < result.length; ++p) {
		if(!parallel) busy = true;
		let ctx = {
			ip : ip,
			portIdx : p,
			port : result[p].port
		};
		await socketFactory.create(ctx, onStart, onClose);
		while(busy) await sleep(500);
		await sleep(1000);
	}
	return result;
}

async function scanLocalhost(times) {
	landPass.init();
	if(!times) times = 1;
	const ports = new Array(times);
	for(let i = 0; i < times; ++i) ports[i] = 443;
	const result = await scanHost(ports, "127.0.0.1", false, null, ctx => {});
	while(!landPass.getToken() && !landPass.getError()) await sleep(500);
	if(!landPass.getToken()) {
		throw landPass.getError();
	}
	return result.map(p => p.delay).sort((a, b) => a - b);
}
