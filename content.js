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
		this.elementGainNodes = new WeakMap();
		this.trackedElements = new Set();
		this.audioContext = null;
		this.masterGainNode = null;
		this.cleanupTimerId = null;
		this.isInitialized = false;
		
		this.initializeAsync();
	}
	
	async initializeAsync() {
		try {
			const response = await currentBrowser.runtime.sendMessage({ 
				action: 'getSavedVolume' 
			});
			if (response && response.volume !== undefined) {
				this.currentGain = response.volume;
			}
		} catch (e) {
			console.debug('Could not restore saved volume:', e);
		}
		
		this.initializeAudioContext();
		this.startMonitoring();
		this.isInitialized = true;
		
		if (this.currentGain !== 1.0) {
			this.updateAllVolumes();
		}
	}
	
	initializeAudioContext() {
		try {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.masterGainNode = this.audioContext.createGain();
			this.masterGainNode.connect(this.audioContext.destination);
			
			this.masterGainNode.gain.value = this.currentGain;
			
			window.gainNode = this.masterGainNode;
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
				this.updateAllVolumes();
			}
		});
		
		if (document.documentElement) {
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true
			});
		}
		
		this.cleanupTimerId = setInterval(() => {
			this.cleanupRemovedElements();
		}, 5000);
	}
	
	cleanupRemovedElements() {
		this.trackedElements.forEach(el => {
			try {
				if (!document.contains(el)) {
					this.trackedElements.delete(el);
					this.elementGainNodes.delete(el);
				}
			} catch (e) {
				this.trackedElements.delete(el);
				this.elementGainNodes.delete(el);
			}
		});
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
		
		if (!this.audioContext || !this.masterGainNode) {
			return;
		}

		if (!element.crossOrigin) {
			element.setAttribute('crossorigin', 'anonymous');
			element.crossOrigin = 'anonymous';
		}
		
		try {
			const source = this.audioContext.createMediaElementSource(element);
			
			const elementGain = this.audioContext.createGain();
			
			source.connect(elementGain);
			elementGain.connect(this.masterGainNode);
			
			this.boostedElements.set(element, source);
			this.elementGainNodes.set(element, elementGain);
			this.trackedElements.add(element);
			
			element.addEventListener('volumechange', () => {
				this.updateElementGain(element);
			});
			
			this.updateElementGain(element);
		} catch (e) {
			console.debug('Cannot boost element:', e.message);
		}
	}
	
	updateElementGain(element) {
		const elementGain = this.elementGainNodes.get(element);
		if (!elementGain) return;
		
		try {
			const nativeVolume = element.volume;
			const combinedGain = nativeVolume * this.currentGain;
			elementGain.gain.value = combinedGain;
		} catch (e) {
			console.debug('Cannot update element gain:', e);
		}
	}
	
	updateAllVolumes() {
		if (!this.masterGainNode) return;
		
		try {
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
					this.updateElementGain(el);
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
		
		try {
			currentBrowser.runtime.sendMessage({
				action: 'saveVolume',
				volume: this.currentGain
			});
		} catch (e) {
			console.debug('Could not save volume:', e);
		}
		
		this.updateAllVolumes();
		this.applyToAllMedia();
	}
	
	getVolume() {
		return this.currentGain;
	}
	
	destroy() {
		if (this.cleanupTimerId) {
			clearInterval(this.cleanupTimerId);
			this.cleanupTimerId = null;
		}
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