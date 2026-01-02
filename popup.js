const currentBrowser = typeof browser === "undefined" ? chrome : browser;
const browserName = typeof browser === "undefined" ? "chrome" : "browser";
const currentLang = currentBrowser.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';

const colorValues = {
	'safe': '#66ff00',
	'warning': '#ffe600',
	'caution': '#ff9500',
	'unsafe': '#de007e',
	'danger': '#cb0000'
}

const volumes = { min: 0, max: 500, step: 5 };

document.addEventListener('DOMContentLoaded', () => {
	const elementsToLocalize = document.querySelectorAll('[data-localeKey]');
	const currentValueContainer = document.querySelector('.tbr-current-value');
	const slider = document.getElementById('vol-slider');
	const btnIncrease = document.getElementById('vol-plus');
	const btnDecrease = document.getElementById('vol-minus');
	const staticButtonWrapper = document.querySelector('.tbr-controls__static-values');
	const staticButtonValues = [0, 50, 100, 200, 300, 400, 500];

	elementsToLocalize.forEach(element => {
		const key = element.getAttribute('data-localeKey');
		const localizedText = currentBrowser.i18n.getMessage(key);
		element.textContent = localizedText;
	});

	console.log(`${currentLang}\n${browserName}`);
	
	btnDecrease.addEventListener('click', () => adjustVolume(-volumes.step));
	btnIncrease.addEventListener('click', () => adjustVolume(volumes.step));
	btnDecrease.textContent = `−${volumes.step}%`;
	btnIncrease.textContent = `+${volumes.step}%`;
	
	slider.addEventListener('input', () => setTabVolume(slider.value));
	slider.setAttribute('min', volumes.min);
	slider.setAttribute('max', volumes.max);
	slider.setAttribute('step', volumes.step);
	setSliderGradient(slider);

	staticButtonWrapper.innerHTML = '';

	staticButtonValues.forEach(value => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.textContent = `${value}%`;
		btn.addEventListener('click', () => setTabVolume(value));
		staticButtonWrapper.appendChild(btn);
	});

	getCurrentVolume().then(vol => updateUI(vol)).catch(() => updateUI(100));
	populateAudibleTabsList();
});

function setSliderGradient(slider, segmentSize = 25) {
	function lightenColor(hex, percent) {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		
		const newR = Math.round(r + (255 - r) * percent);
		const newG = Math.round(g + (255 - g) * percent);
		const newB = Math.round(b + (255 - b) * percent);
		
		return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
	}
	
	function darkenColor(hex, percent) {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		
		const newR = Math.round(r * (1 - percent));
		const newG = Math.round(g * (1 - percent));
		const newB = Math.round(b * (1 - percent));
		
		return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
	}
	
	const gradientStops = [];
	
	for (let i = 0; i <= 200; i += segmentSize) {
		const percentStart = i / 500 * 100;
		const percentEnd = Math.min((i + segmentSize) / 500 * 100, 200 / 500 * 100);
		const darkenAmount = (200 - i) / 200 * 0.5;
		const color = darkenColor(colorValues.safe, darkenAmount);
		gradientStops.push(`${color} ${percentStart}%`, `${color} ${percentEnd}%`);
	}
	
	for (let i = 200; i < 250; i += segmentSize) {
		const percentStart = i / 500 * 100;
		const percentEnd = Math.min((i + segmentSize) / 500 * 100, 250 / 500 * 100);
		const lightenAmount = (250 - i - segmentSize) / 50 * 0.45;
		const color = lightenColor(colorValues.warning, Math.max(0, lightenAmount));
		gradientStops.push(`${color} ${percentStart}%`, `${color} ${percentEnd}%`);
	}
	
	for (let i = 250; i < 300; i += segmentSize) {
		const percentStart = i / 500 * 100;
		const percentEnd = Math.min((i + segmentSize) / 500 * 100, 300 / 500 * 100);
		const lightenAmount = (300 - i - segmentSize) / 50 * 0.4;
		const color = lightenColor(colorValues.caution, Math.max(0, lightenAmount));
		gradientStops.push(`${color} ${percentStart}%`, `${color} ${percentEnd}%`);
	}
	
	for (let i = 300; i < 350; i += segmentSize) {
		const percentStart = i / 500 * 100;
		const percentEnd = Math.min((i + segmentSize) / 500 * 100, 350 / 500 * 100);
		const lightenAmount = (350 - i - segmentSize) / 50 * 0.4;
		const color = lightenColor(colorValues.unsafe, Math.max(0, lightenAmount));
		gradientStops.push(`${color} ${percentStart}%`, `${color} ${percentEnd}%`);
	}
	
	for (let i = 350; i <= 500; i += segmentSize) {
		const percentStart = i / 500 * 100;
		const percentEnd = Math.min((i + segmentSize) / 500 * 100, 100);
		const lightenAmount = (500 - i) / 150 * 0.4;
		const color = lightenColor(colorValues.danger, lightenAmount);
		gradientStops.push(`${color} ${percentStart}%`, `${color} ${percentEnd}%`);
	}
	
	slider.style.background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
}

function getVolumeColor(value) {
	return value <= 200 ? colorValues.safe
	: value <= 250 ? colorValues.warning
	: value <= 300 ? colorValues.caution
	: value <= 350 ? colorValues.unsafe
	: colorValues.danger;
}

function setTabVolume(volume) {
	const vol = clampVolumeValue(volume);
	currentBrowser.tabs.query({active: true, currentWindow: true}, (tabs) => {
		if (tabs[0]) {
			currentBrowser.scripting.executeScript({
				target: {tabId: tabs[0].id},
				func: applyVolumeBoost,
				args: [vol / 100]
			}).catch((error) => {
				console.error('Failed to apply volume:', error);
			});
		}
	});
	updateUI(vol);
}

function adjustVolume(delta) {
	getCurrentVolume().then(currentVolume => {
		const newVolume = clampVolumeValue(currentVolume + delta);
		setTabVolume(newVolume);
	}).catch(() => {
		setTabVolume(clampVolumeValue(volumes.min));
	});
}


function getCurrentVolume() {
	return new Promise((resolve, reject) => {
		currentBrowser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs[0]) {
				resolve(100);
				return;
			}
			currentBrowser.scripting.executeScript({
				target: { tabId: tabs[0].id },
				func: getVolumeBoost
			}).then((results) => {
				const vol = results?.[0]?.result != null ? Math.round(results[0].result * 100) : 100;
				resolve(vol);
			}).catch(() => {
				resolve(100);
			});
		});
	});
}


function updateUI(volume) {
	const slider = document.getElementById('vol-slider');
	const currentValueContainer = document.querySelector('.tbr-current-value');
	
	slider.value = volume;
	currentValueContainer.textContent = `${volume}%`;
	currentValueContainer.style.color = volume >= 160 ? getVolumeColor(volume) : '#333';
	
	currentBrowser.action.setBadgeText({ text: `${volume}` });
	currentBrowser.action.setBadgeBackgroundColor({ color: getVolumeColor(volume) });
}

function resetUI() {
	currentBrowser.action.setBadgeText({ text: '' });
}

function applyVolumeBoost(gain) {
	if (!window.audioContext) {
		window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
		window.gainNode = window.audioContext.createGain();
		
		const mediaElements = document.querySelectorAll('video, audio');
		mediaElements.forEach(media => {
			if (!media.dataset.boosted) {
				try {
					const source = window.audioContext.createMediaElementSource(media);
					source.connect(window.gainNode);
					window.gainNode.connect(window.audioContext.destination);
					media.dataset.boosted = 'true';
				} catch (e) {
					console.warn('Failed to boost media element:', e);
				}
			}
		});
	}
	
	if (window.gainNode) {
		window.gainNode.gain.value = gain;
	}
}

function getVolumeBoost() {
	return window.gainNode ? window.gainNode.gain.value : null;
}

function clampVolumeValue(value, min = volumes.min, max = volumes.max) {
	return Math.min(Math.max(value, min), max);
}


async function populateAudibleTabsList() {
	const listContainer = document.querySelector('.tbr-audible-tabs-list')
	if (!listContainer) return

	listContainer.innerHTML = ''

	try {
		const tabs = await currentBrowser.tabs.query({currentWindow: true})
		const audibleTabs = tabs.filter(tab => tab.audible)

		if (audibleTabs.length === 0) {
			const emptyItem = document.createElement('div')
			emptyItem.textContent = currentBrowser.i18n.getMessage('noAudibleTabs')
			emptyItem.classList.add('tbr-audible-tab-empty')
			listContainer.appendChild(emptyItem)
			return
		}

		audibleTabs.forEach(async tab => {
			const tabItem = document.createElement('div')
			tabItem.classList.add('tbr-audible-tab')

			const favIcon = document.createElement('img')
			favIcon.src = tab.favIconUrl || 'icons/default-16.png'
			favIcon.classList.add('tbr-tab-icon')
			favIcon.width = 16
			favIcon.height = 16

			const title = document.createElement('span')
			title.textContent = tab.title || 'Untitled'
			title.classList.add('tbr-tab-title')

			const volumeLabel = document.createElement('span')
			volumeLabel.classList.add('tbr-tab-volume')
			volumeLabel.textContent = '…'

			tabItem.appendChild(favIcon)
			tabItem.appendChild(title)
			tabItem.appendChild(volumeLabel)

			try {
				const results = await currentBrowser.scripting.executeScript({
					target: {tabId: tab.id},
					func: () => window.gainNode ? window.gainNode.gain.value : null
				})
				const gain = results?.[0]?.result
				if (gain != null) {
					volumeLabel.textContent = `${Math.round(gain * 100)}%`
				} else {
					volumeLabel.textContent = '100%'
				}
			} catch {
				volumeLabel.textContent = '100%'
			}

			const volumeValue = parseInt(volumeLabel.textContent)

			volumeLabel.style.backgroundColor = getVolumeColor(volumeValue)
			volumeLabel.style.color = (volumeValue >= 300 || volumeValue <= 200) ? '#fff' : '#333'

			tabItem.addEventListener('click', () => {
				currentBrowser.tabs.update(tab.id, {active: true})
				currentBrowser.windows.update(tab.windowId, {focused: true})
			})

			listContainer.appendChild(tabItem)
		})

	} catch (e) {
		console.error('Error fetching audible tabs:', e)
	}
}
