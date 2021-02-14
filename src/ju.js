/*
 Copyright (c) 2021 Taras Greben <taras.greben@gmail.com> LAND.eTaras.com. All rights Reserved.
*/

const StringBuffer = () => {
	const res = [];

	const _push = v => {
		if(v) res.push(v);
	};

	const _pushPadded = (v, len, ch) => {
		if(!ch) ch = '0';
		v = (v ? v.toString() : "");
		if(v.length < len) {
			for(let i = v.length; i < len; ++i) {
				_push(ch);
			}
		}
		_push(v);
	};

	const _p1 = (v, l, s) => {
		_pushPadded(v, l);
		_push(s);
	};

	const _pd = d => {
		_p1(d.getDate(), 2, '.');
		_p1(d.getMonth() + 1, 2, '.');
		_pushPadded(d.getFullYear(), 4);
	};

	const _pdi = d => {
		_push(d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}));
	};

	const _pushDate = d => {
		if(!d) d = new Date();
		_pdi(d);
		return d;
	};

	const _pushTime = d => {
		if(!d) d = new Date();
		_p1(d.getHours(), 2, ':');
		_pushPadded(d.getMinutes(), 2);
		return d;
	};

	const _pushTimeMs = d => {
		if(!d) d = new Date();
		_pushTime(d);
                _push(':');
                _p1(d.getSeconds(), 2, ':');
                _p1(d.getMilliseconds(), 3);
		return d;
	};

	const _pushDateTime = d => {
		d = _pushTime(d);
		_push(' ');
		_pushDate(d);
		return d;
       	};

	const _pushTimestamp = d => {
		d = _pushTimeMs(d);
		_push(' ');
		_pushDate(d);
		return d;
       	};

	return {
		toString : () => res.join(''),
		push : v => _push(v),
		pushPadded : (v, len, ch) => _pushPadded(v, len, ch),
		pushDate : date => _pushDate(date),
		pushTime : date => _pushTime(date),
		pushDateTime : date => _pushDateTime(date),
		pushTimestamp : date => _pushTimestamp(date),
	};

};

const getDateTime = date => {
        const b = StringBuffer();
        b.pushDateTime(date);
        return b.toString();
};

const getTimestamp = date => {
        const b = StringBuffer();
        b.pushTimestamp(date);
        return b.toString();
};

const timeToString = ms => {
	const b = StringBuffer();
	const sa = Math.floor(ms / 1000);
	const h = Math.floor(sa / 3600);
	if(h > 0) {
		b.push(h);
		b.push(":");
	}
	b.pushPadded(Math.floor((sa % 3600) / 60), h > 0 ? 2 : 1, "0");
	b.push(":")
	b.pushPadded(sa % 60, 2, "0");
	return b.toString();
};

const empty = s => (!s || s.length == 0);

const oT = (t, a) => "<" + t + (a ? " " + a : "") + ">";
const cT = t => oT("/" + t);
const hT = (v, t, a) => "<"+ t + (a ? " " + a : "") + (v ? ">" + v + "</" + t + ">" : "/>");
const hO = v => hT(v, "option") + "\n";
const hAtr = (n, v) => ((v != null) ? ' ' + n + '="' + v + '"' : '');
const hB = v => hT(v, "b");
const hTd = (v, a) => hT(v, "td", a);
const hTr = (v, a) => hT(v, "tr", a) + "\n";
const hFRow = (l,c,h) => hTr(hTd(hB(l)) + hTd(c) + (h?hTd(h):''));
const ce = (c, t) => {
        const e = document.createElement(t ? t : 'div');
        if(c) e.className = c;
        return e;
};
const ge = id => document.getElementById(id);
const gt = (o, tag) => o.getElementsByTagName(tag);
const gc = className => document.getElementsByClassName(className);
const euri = v => encodeURIComponent(v);
const duri = v => decodeURIComponent(v);
const uri = v => euri(v).replace(/%20/g,'+');
const escp = v => v.replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');

const Table = (hName, hColumns) => {
	const headerName = (Array.isArray(hName) ? hName : [hName]);
	const headerColumns = hColumns;

	let d = [];
	let dNames = [];

	const addTag = (buffer, tag, value) => buffer.push(hT(value, tag));
	const addCell = (buffer, tag, value) => buffer.push(hT(value.value, tag,
		+ ((value.style && value.style > 0) ? hAtr("class", value.style) : null)));

	const addR = (buffer, tag, name, values) => {
		let b = [];
		if(name) (typeof name !== "object" ? addTag(b, tag, name) : addCell(b, tag, name));
		values.forEach(v => (typeof v !== "object" ? addTag(b, tag, v) : addCell(b, tag, v)));
		addTag(buffer, "tr", b.join(""));
	};

	return () => {
		const _getHtml = () => {
			let b = [];
			b.push(oT("table"));
			const htl = headerName.length;
			if(htl > 0) {
				b.push(oT("tr"));
				if(headerName.length >= (headerColumns.length + 1)) {
					headerName.forEach(v => b.push(hT(v, "th")));
				} else {
					for(let i = 0; i < (htl - 1); ++i) {
						b.push(hT(headerName[i], "th"));
					}
					b.push(hT(headerName[htl - 1], "th", hAtr("colspan", (headerColumns.length - htl + 2))));
				}
				b.push(cT("tr"));
			}
			d.forEach(v => addR(b, "td", v.name, v.values));
			b.push(cT("table"));
			return b.join("\n");
		};

		const getCell = (n, column) => {
			let i = dNames.indexOf(n);
			if(i < 0) {
				d.length = dNames.length + 1;
				i = dNames.push(n) - 1;
				const v = [];
				v.length = headerColumns.length;
				d[i] = {name : {value : n, style : 0}, values : v};
			}
			if(!column) return d[i].name;
			let x = headerColumns.indexOf(column);
			if(x < 0) {
				let eMsg = "Can't find " + n + "." + column + " in the table";
				console.error(eMsg);
				throw eMsg;
			}
			if(!d[i]) {
				let eMsg = "Can't find " + n + "." + column + " (" + x + ") in the table";
				console.error(eMsg);
				throw eMsg;
			}
			let cellData = d[i].values[x];
			if(!cellData) {
				d[i].values[x] = {value : "", style : 0};
				cellData = d[i].values[x];
			}
			return cellData;
		};

		return {
			set : (n, column, value) => {
//				console.info(n + " " + column + " = " + value);
				getCell(n, column).value = value;
			},

			setStyle : (n, style) => {
//				console.info(n + " style = " + style);
				getCell(n, null).style = style;
			},

			getHtml : () => _getHtml(),

		};
	};
};
