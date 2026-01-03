const currentBrowser = typeof browser === "undefined" ? chrome : browser;

const colorValues = {
	safe:    '#66ff00',
	warning: '#ffe600',
	caution: '#ff9500',
	unsafe:  '#de007e',
	danger:  '#cb0000'
};

const volumes = { min: 0, max: 500 };

function clampVolumeValue(value, min = volumes.min, max = volumes.max) {
	return Math.min(Math.max(value, min), max);
}

function getVolumeColor(value) {
	return value <= 200 ? colorValues.safe
	: value <= 250 ? colorValues.warning
	: value <= 300 ? colorValues.caution
	: value <= 350 ? colorValues.unsafe
	: colorValues.danger;
}

function updateUI(volume) {
	currentBrowser.action.setBadgeText({ text: String(volume) });
	currentBrowser.action.setBadgeBackgroundColor({
		color: getVolumeColor(volume)
	});
}

function resetUI() {
	currentBrowser.action.setBadgeText({ text: '' });
}

function getVolumeBoost() {
	return window.gainNode ? window.gainNode.gain.value : null;
}

function refreshBadgeForTab(tabId) {
	if (!tabId) {
		resetUI();
		return;
	}

	currentBrowser.tabs.sendMessage(
		tabId,
		{ action: 'getVolume' },
		(response) => {
			if (currentBrowser.runtime.lastError || !response || !response.success) {
				currentBrowser.scripting.executeScript({
					target: { tabId },
					func: getVolumeBoost
				})
				.then((results) => {
					const gain = results?.[0]?.result;
					if (gain != null) {
						const vol = clampVolumeValue(Math.round(gain * 100));
						updateUI(vol);
					} else {
						resetUI();
					}
				})
				.catch(() => {
					resetUI();
				});
			} else {
				const vol = clampVolumeValue(Math.round(response.volume * 100));
				updateUI(vol);
			}
		}
	);
}

currentBrowser.tabs.onActivated.addListener(({ tabId }) => {
	refreshBadgeForTab(tabId);
});

currentBrowser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'loading') {
		if (tab.active) resetUI();
	}

	if (changeInfo.status === 'complete') {
		if (tab.active) {
			setTimeout(() => {
				refreshBadgeForTab(tabId);
			}, 100);
		}
	}
});

currentBrowser.tabs.onRemoved.addListener(() => {
	resetUI();
});

currentBrowser.tabs.query({ active: true, currentWindow: true })
	.then((tabs) => {
		if (tabs[0]) {
			setTimeout(() => {
				refreshBadgeForTab(tabs[0].id);
			}, 100);
		} else {
			resetUI();
		}
	});