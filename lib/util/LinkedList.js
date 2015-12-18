"use strict";


var LinkedList = squishy.createClass(
	function() {
		// ctor
		this.head = null;
		this.tail = null;
		this.nNodes = 0;
	},
	{
		// methods
		size: function() {
			return this.nNodes;
		},

		forEach: function(cb) {
			for (var current = this.head; current != null; current = current._next) {
				cb(current);
			}
		},

		getHeadNode: function() {
			return this.head;
		},

		getTailNode: function() {
			return this.tail;
		},

		pushBack: function(data) {
			var node = new LinkedList.Node(this, data);

			this._pushBackNodeImpl(node);

			return node;
		},

		removeNode: function(node) {
			console.assert(node._list === this);
			--this.nNodes;

			var prev = node._prev;
			var next = node._next;

			if (prev) {
				prev._next = next;
			}
			if (next) {
				next._prev = prev;
			}
			if (node === this.tail) {
				this.tail = prev;
				console.assert(!this.tail.next);
			}
			else if (node === this.head) {
				this.head = next;
				console.assert(!this.head.prev);
			}

			node._prev = node._next = null;
			node._list = null;
		},

		pushBackNode: function(node) {
			console.assert(node && node._list === this, 'Invalid list node in pushBackNode');

			if (this.size() > 1) {
				// if size === 1, node is already at back
				this.removeNode(node);
				node._list = this;
				this._pushBackNodeImpl(node);
			}
		},

		_pushBackNodeImpl: function(node) {
			++this.nNodes;
			if (this.tail) {
				node._prev = this.tail;
				this.tail._next = node;
				this.tail = node;
			}
			else {
				// first element
				console.assert(this.nNodes === 1);
				this.tail = this.head = node;
			}
		}

	}
);

//var lastNodeId = 0;

LinkedList.Node = squishy.createClass(
	function(list, data) {
		// ctor
		//this._nodeId = ++lastNodeId;
		this._list = list;
		this._prev = null;
		this._next = null;
		this.data = data;
	},
	{
		// methods

	}
);

module.exports = LinkedList;