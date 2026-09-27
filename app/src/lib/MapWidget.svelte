<script lang="ts">
	import { onMount } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

	type Place = { id: string; name: string; lat: number; lon: number };
	let {
		places,
		token,
		selectedId,
		onSelect
	}: {
		places: Place[];
		token: string;
		selectedId: string | null;
		onSelect: (place: Place) => void;
	} = $props();
	let container: HTMLDivElement;
	let markers: { id: string; element: HTMLButtonElement }[] = [];

	onMount(() => {
		let disposed = false;
		let map: import('maplibre-gl').Map | undefined;
	void import('maplibre-gl').then((maplibregl) => {
		if (disposed) return;
		maplibregl.setWorkerUrl(workerUrl);
			const createdMap = new maplibregl.Map({
				container,
			style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${encodeURIComponent(token)}`,
			center: [places[0].lon, places[0].lat],
			zoom: 13
			});
			map = createdMap;
			createdMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
			const bounds = new maplibregl.LngLatBounds();
			for (const place of places) {
				bounds.extend([place.lon, place.lat]);
				const element = document.createElement('button');
				element.type = 'button';
				element.className = 'map-place-marker';
				element.setAttribute('aria-label', `Select ${place.name}`);
				element.title = place.name;
				element.addEventListener('click', () => onSelect(place));
				new maplibregl.Marker({ element }).setLngLat([place.lon, place.lat]).addTo(createdMap);
				markers.push({ id: place.id, element });
			}
			if (places.length > 1)
				createdMap.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
			for (const marker of markers)
				marker.element.dataset.selected = String(marker.id === selectedId);
		});
		return () => {
			disposed = true;
			map?.remove();
			markers = [];
		};
	});

	$effect(() => {
		for (const marker of markers)
			marker.element.dataset.selected = String(marker.id === selectedId);
	});
</script>

<div
	bind:this={container}
	class="h-64 w-full overflow-hidden rounded-lg"
	aria-label="Restaurant map"
></div>

<style>
	:global(.map-place-marker) {
		width: 16px;
		height: 16px;
		border: 2px solid white;
		border-radius: 50%;
		background: #262626;
		box-shadow: 0 1px 5px #0008;
		cursor: pointer;
	}
	:global(.map-place-marker[data-selected='true']) {
		background: #f7f6f1;
		border-color: #262626;
		width: 20px;
		height: 20px;
	}
</style>
