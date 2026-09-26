<script lang="ts">
	import { onMount } from 'svelte';
	import 'mapbox-gl/dist/mapbox-gl.css';

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
		let map: import('mapbox-gl').Map | undefined;
		void import('mapbox-gl').then(({ default: mapboxgl }) => {
			if (disposed) return;
			map = new mapboxgl.Map({
				container,
				accessToken: token,
				style: 'mapbox://styles/mapbox/dark-v11',
				center: [places[0].lon, places[0].lat],
				zoom: 13,
				attributionControl: true
			});
			map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
			const bounds = new mapboxgl.LngLatBounds();
			for (const place of places) {
				bounds.extend([place.lon, place.lat]);
				const element = document.createElement('button');
				element.type = 'button';
				element.className = 'map-place-marker';
				element.setAttribute('aria-label', `Select ${place.name}`);
				element.title = place.name;
				element.addEventListener('click', () => onSelect(place));
				new mapboxgl.Marker({ element }).setLngLat([place.lon, place.lat]).addTo(map);
				markers.push({ id: place.id, element });
			}
			if (places.length > 1) map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 0 });
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
