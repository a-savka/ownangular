var _ = require('lodash');

function initWatchVal() {}

function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$applyAsyncQueue = [];
	this.$$applyAsyncId = null;
	this.$$postDigestQueue = [];
	this.$$phase = null;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
	var self = this;
	var watcher = {
		watchFn: watchFn,
		listenerFn: listenerFn || function() {},
		valueEq: !!valueEq,
		last: initWatchVal
	};
	this.$$watchers.unshift(watcher);
	this.$$lastDirtyWatch = null;
	return function() {
		var index = self.$$watchers.indexOf(watcher);
		if(index >= 0) {
			self.$$watchers.splice(index, 1);
		}
	};
};


Scope.prototype.$digest = function() {
	var dirty;
	var ttl = 10;
	this.$$lastDirtyWatch = null;
	this.$beginPhase('$digest');

	if(this.$$applyAsyncId) {
		clearTimeout(this.$$applyAsyncId);
		this.$$flushApplyAsync();
	}

	do {
		while(this.$$asyncQueue.length) {
			try {
				var asyncTask = this.$$asyncQueue.shift();
				asyncTask.scope.$eval(asyncTask.expression);
			} catch (e) {
				console.error(e);
			}
		}
		dirty = this.$$digestOnce();
		if((dirty || this.$$asyncQueue.length) && !(ttl--)) {
			throw "10 digest iterations reached";
		}
	} while (dirty || this.$$asyncQueue.length);
	this.$clearPhase();

	while(this.$$postDigestQueue.length) {
		try {
			this.$$postDigestQueue.shift()();
		} catch(e) {
			console.error(e);
		}
	}
};

Scope.prototype.$eval = function(expr, arg) {
	return expr(this, arg);
};

Scope.prototype.$evalAsync = function(expr) {
	var self = this;
	if(!self.$$phase && !self.$$asyncQueue.length) {
		setTimeout(function() {
			if(self.$$asyncQueue.length) {
				self.$digest();
			}
		}, 0);
	}
	this.$$asyncQueue.push({ scope: this, expression: expr });
};

Scope.prototype.$apply = function(expr) {
	try {
		this.$beginPhase('$apply');
		this.$eval(expr);
	} finally {
		this.$clearPhase();
		this.$digest();
	}
};

Scope.prototype.$applyAsync = function(expr) {
	var self = this;
	self.$$applyAsyncQueue.push(function() {
		self.$eval(expr);
	});
	if(self.$$applyAsyncId === null) {
		self.$$applyAsyncId = setTimeout(function() {
			self.$apply(_.bind(self.$$flushApplyAsync, self));
		}, 0);
	}
};

Scope.prototype.$$flushApplyAsync = function() {
	while(this.$$applyAsyncQueue.length) {
		try {
			this.$$applyAsyncQueue.shift()();
		} catch(e) {
			console.error(e);
		}
	}
	this.$$applyAsyncId = null;
};

Scope.prototype.$beginPhase = function(phase) {
	if(this.$$phase) {
		throw this.$$phase + ' already in progress.';
	}
	this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
	this.$$phase = null;
};

Scope.prototype.$$digestOnce = function() {
	var self = this;
	var newValue, oldValue, dirty;
	_.forEachRight(this.$$watchers, function(watcher) {
		try {
			newValue = watcher.watchFn(self);
			oldValue = watcher.last;
			if(!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
				self.$$lastDirtyWatch = watcher;
				watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
				watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
				dirty = true;
			}
			else if(watcher === self.$$lastDirtyWatch) {
				return false;
			}
		} catch(e) {
			console.error(e);
		}
	});
	return dirty;
};

Scope.prototype.$$postDigest = function(fn) {
	this.$$postDigestQueue.push(fn);
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
	if(valueEq) {
		return _.isEqual(newValue, oldValue);
	}
	return (
		newValue === oldValue ||
		typeof newValue === 'number' && typeof oldValue === 'number' &&
			isNaN(newValue) && isNaN(oldValue)
	);
};



module.exports = Scope;
