const currentBrowser = typeof browser === "undefined" ? chrome : browser;

(function injectWebAudioInterceptor() {
	const script = document.createElement('script');
	script.textContent = `
		(function() {
			if (window.__volumeControllerInjected) return;
			window.__volumeControllerInjected = true;
			
			const contexts = [];
			const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
			
			if (!OriginalAudioContext) return;
			
			function WrappedAudioContext(...args) {
				const ctx = new OriginalAudioContext(...args);
				const gain = ctx.createGain();
				const originalDestination = ctx.destination;
				
				gain.connect(originalDestination);
				
				ctx._originalDestination = originalDestination;
				
				Object.defineProperty(ctx, 'destination', {
					get: function() { return gain; },
					configurable: false,
					enumerable: true
				});
				
				contexts.push(gain);
				window.__volumeGains = contexts;
				
				return ctx;
			}
			
			Object.setPrototypeOf(WrappedAudioContext, OriginalAudioContext);
			WrappedAudioContext.prototype = OriginalAudioContext.prototype;
			
			window.AudioContext = WrappedAudioContext;
			if (window.webkitAudioContext) {
				window.webkitAudioContext = WrappedAudioContext;
			}
		})();
	`;
	
	try {
		(document.head || document.documentElement).appendChild(script);
		script.remove();
	} catch (e) {
		console.error('Failed to inject Web Audio interceptor:', e);
	}
})();

class VolumeManager {
	constructor() {
		this.currentGain = 1.0;
		this.boostedElements = new WeakMap();
		this.trackedElements = new Set();
		this.audioContext = null;
		this.gainNode = null;
		
		this.initializeAudioContext();
		this.startMonitoring();
	}
	
	initializeAudioContext() {
		try {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.gainNode = this.audioContext.createGain();
			this.gainNode.connect(this.audioContext.destination);
			
			window.gainNode = this.gainNode;
			window.audioContext = this.audioContext;
		} catch (e) {
			console.error('Failed to initialize audio context:', e);
		}
	}
	
	startMonitoring() {
		this.applyToAllMedia();
		
		const observer = new MutationObserver((mutations) => {
			let hasNewMedia = false;
			
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType === 1) {
						if (node.matches?.('video, audio')) {
							hasNewMedia = true;
							this.boostMediaElement(node);
						} else {
							const mediaElements = node.querySelectorAll?.('video, audio');
							if (mediaElements && mediaElements.length > 0) {
								hasNewMedia = true;
								mediaElements.forEach(el => this.boostMediaElement(el));
							}
						}
					}
				}
			}
			
			if (hasNewMedia) {
				this.applyToAllMedia();
			}
		});
		
		if (document.documentElement) {
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true
			});
		}
		
		setInterval(() => {
			this.updateAllVolumes();
		}, 1000);
	}
	
	applyToAllMedia() {
		document.querySelectorAll('video, audio').forEach(el => {
			this.boostMediaElement(el);
		});
	}
	
	boostMediaElement(element) {
		if (this.boostedElements.has(element)) {
			return;
		}
		
		if (!this.audioContext || !this.gainNode) {
			return;
		}
		
		try {
			const source = this.audioContext.createMediaElementSource(element);
			source.connect(this.gainNode);
			this.boostedElements.set(element, source);
			this.trackedElements.add(element);
			
			element.addEventListener('volumechange', () => {
				if (this.currentGain <= 1.0) {
					element.volume = Math.min(1.0, this.currentGain);
				} else {
					element.volume = 1.0;
				}
			});
		} catch (e) {
			console.debug('Cannot boost element:', e.message);
		}
	}
	
	updateAllVolumes() {
		if (!this.gainNode) return;
		
		try {
			this.gainNode.gain.value = this.currentGain;
			
			if (window.__volumeGains) {
				window.__volumeGains.forEach(gain => {
					try {
						gain.gain.value = this.currentGain;
					} catch (e) {
					}
				});
			}
			
			this.trackedElements.forEach(el => {
				try {
					if (document.contains(el)) {
						if (this.currentGain <= 1.0) {
							el.volume = Math.min(1.0, this.currentGain);
						} else {
							el.volume = 1.0;
						}
					} else {
						this.trackedElements.delete(el);
					}
				} catch (e) {
					console.debug('Cannot update element volume:', e);
				}
			});
		} catch (e) {
			console.error('Failed to update volumes:', e);
		}
	}
	
	setVolume(gain) {
		this.currentGain = Math.max(0, Math.min(5, gain));
		this.updateAllVolumes();
		
		this.applyToAllMedia();
	}
	
	getVolume() {
		return this.currentGain;
	}
}

const volumeManager = new VolumeManager();

currentBrowser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	try {
		if (request.action === 'setVolume') {
			volumeManager.setVolume(request.volume);
			sendResponse({ success: true, volume: volumeManager.getVolume() });
		} else if (request.action === 'getVolume') {
			sendResponse({ success: true, volume: volumeManager.getVolume() });
		}
	} catch (e) {
		console.error('Error handling message:', e);
		sendResponse({ success: false, error: e.message });
	}
	return true;
});