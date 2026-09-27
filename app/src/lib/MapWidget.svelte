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
		token: string | null;
		selectedId: string | null;
		onSelect: (place: Place) => void;
	} = $props();
	let container = $state<HTMLDivElement>();
	let carousel: HTMLDivElement;
	let map: import('maplibre-gl').Map | undefined;
	let markers: { id: string; element: HTMLButtonElement }[] = [];

	function select(place: Place, index: number) {
		onSelect(place);
		map?.easeTo({ center: [place.lon, place.lat], duration: 350 });
		const card = carousel.children[index] as HTMLElement | undefined;
		if (card) {
			carousel.scrollTo({
				left: card.offsetLeft - carousel.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2,
				behavior: 'smooth'
			});
		}
	}

	onMount(() => {
		const target = container;
		if (!token || !target) return;
		let disposed = false;
		void import('maplibre-gl').then((maplibregl) => {
			if (disposed) return;
			maplibregl.setWorkerUrl(workerUrl);
			const createdMap = new maplibregl.Map({
				container: target,
				style: `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${encodeURIComponent(token)}`,
				center: [places[0].lon, places[0].lat],
				zoom: 13,
				attributionControl: false
			});
			map = createdMap;
			createdMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
			const bounds = new maplibregl.LngLatBounds();
			for (const [index, place] of places.entries()) {
				bounds.extend([place.lon, place.lat]);
				const element = document.createElement('button');
				element.type = 'button';
				element.className = 'map-place-marker';
				element.setAttribute('aria-label', `Select ${place.name}`);
				element.title = place.name;
				element.addEventListener('click', () => select(place, index));
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
			map = undefined;
			markers = [];
		};
	});

	$effect(() => {
		for (const marker of markers)
			marker.element.dataset.selected = String(marker.id === selectedId);
	});
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-secondary">
	{#if token}
		<div bind:this={container} class="h-80 w-full" aria-label="Restaurant map"></div>
	{/if}
	<div
		class={token
			? 'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-6'
			: 'pt-3'}
	>
		<div
			bind:this={carousel}
			class="place-carousel flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-2"
			role="region"
			aria-label="Places found"
		>
			{#each places as place, index (`${place.id}-${index}`)}
				<button
					type="button"
					aria-pressed={selectedId === place.id}
					class="min-h-16 w-44 shrink-0 snap-start rounded-xl border border-primary-foreground/20 bg-secondary/95 px-3 py-2 text-left text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary-foreground"
					onclick={() => select(place, index)}>{place.name}</button
				>
			{/each}
		</div>
		<div class="flex flex-wrap gap-x-2 px-2 pb-1 text-[10px] leading-4 text-white/75">
			<a
				href="https://www.openstreetmap.org/copyright"
				target="_blank"
				rel="noopener noreferrer"
				class="underline-offset-2 hover:underline focus-visible:underline"
				>© OpenStreetMap contributors</a
			>
			<a
				href="https://www.geoapify.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="underline-offset-2 hover:underline focus-visible:underline">Geoapify</a
			>
		</div>
	</div>
</div>

<style>
	.place-carousel {
		scrollbar-width: none;
	}
	.place-carousel::-webkit-scrollbar {
		display: none;
	}
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
