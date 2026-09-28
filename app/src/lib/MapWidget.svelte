<script lang="ts">
	import { onMount } from 'svelte';
	import SFIcon from '@alexdev404/sficons-svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

	type Place = {
		id: string;
		name: string;
		lat: number;
		lon: number;
		address?: string;
		categories?: string[];
	};
	let {
		places,
		token,
		selectedId,
		requestedCuisine,
		onSelect
	}: {
		places: Place[];
		token: string | null;
		selectedId: string | null;
		requestedCuisine?: string;
		onSelect: (place: Place) => void;
	} = $props();
	let container = $state<HTMLDivElement>();
	let carousel: HTMLDivElement;
	let map = $state.raw<import('maplibre-gl').Map>();
	let maplibregl: typeof import('maplibre-gl') | undefined;
	let markers = $state.raw<
		{ id: string; element: HTMLButtonElement; marker: import('maplibre-gl').Marker }[]
	>([]);
	let drawnPlaces = '';
	const widgetId = $props.id();

	function cuisineLabels(place: Place) {
		return [
			...new Set(
				(Array.isArray(place.categories) ? place.categories : [])
					.filter(
						(category) =>
							typeof category === 'string' && /^catering\.(restaurant|cafe)\./.test(category)
					)
					.map((category) => category.split('.').at(-1)!.replace(/[_-]+/g, ' '))
			)
		];
	}

	function select(place: Place, index: number) {
		onSelect(place);
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		map?.easeTo({
			center: [place.lon, place.lat],
			padding: { top: 42, right: 42, bottom: 190, left: 42 },
			duration: reducedMotion ? 0 : 350
		});
		const card = carousel.children[index] as HTMLElement | undefined;
		if (card) {
			carousel.scrollTo({
				left: card.offsetLeft - carousel.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2,
				behavior: reducedMotion ? 'instant' : 'smooth'
			});
		}
	}

	onMount(() => {
		const target = container;
		if (!token || !target) return;
		let disposed = false;
		void import('maplibre-gl').then((loaded) => {
			if (disposed) return;
			maplibregl = loaded;
			maplibregl.setWorkerUrl(workerUrl);
			const createdMap = new maplibregl.Map({
				container: target,
				style: `https://maps.geoapify.com/v1/styles/osm-carto/style.json?apiKey=${encodeURIComponent(token)}`,
				center: [places[0].lon, places[0].lat],
				zoom: 13,
				attributionControl: false
			});
			map = createdMap;
			createdMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
		});
		return () => {
			disposed = true;
			map?.remove();
			map = undefined;
			markers = [];
		};
	});

	$effect(() => {
		if (!map || !maplibregl) return;
		const signature = JSON.stringify(places);
		if (signature === drawnPlaces) return;
		drawnPlaces = signature;
		for (const { marker } of markers) marker.remove();
		const bounds = new maplibregl.LngLatBounds();
		markers = places.map((place, index) => {
			bounds.extend([place.lon, place.lat]);
			const element = document.createElement('button');
			element.type = 'button';
			element.className = 'map-place-marker';
			element.setAttribute('aria-label', `Select ${place.name}`);
			element.title = place.name;
			element.textContent = String(index + 1);
			element.addEventListener('click', () => select(place, index));
			const marker = new maplibregl!.Marker({ element })
				.setLngLat([place.lon, place.lat])
				.addTo(map!);
			return { id: place.id, element, marker };
		});
		if (places.length)
			map.fitBounds(bounds, {
				padding: { top: 42, right: 42, bottom: 190, left: 42 },
				maxZoom: 15,
				duration: 0
			});
	});

	$effect(() => {
		for (const marker of markers)
			marker.element.dataset.selected = String(marker.id === selectedId);
	});
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-secondary">
	{#if token}
		<div bind:this={container} class="h-96 w-full" aria-label="Restaurant map"></div>
	{/if}
	<div
		class={token
			? 'pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-6'
			: 'pt-3'}
	>
		<div
			bind:this={carousel}
			class="place-carousel pointer-events-auto flex snap-x snap-mandatory gap-2 overflow-x-auto px-2 pb-2"
			role="region"
			aria-label="Places found"
		>
			{#each places as place, index (`${place.id}-${index}`)}
				{@const labels = cuisineLabels(place)}
				{@const matchedCuisine = requestedCuisine?.trim().toLowerCase().replace(/[_-]+/g, ' ')}
				{@const matches = !!matchedCuisine && labels.includes(matchedCuisine)}
				<button
					type="button"
					aria-label={place.name}
					aria-describedby={`${widgetId}-details-${index}`}
					aria-pressed={selectedId === place.id}
					class="group flex min-h-36 w-64 shrink-0 snap-center flex-col gap-3 rounded-2xl border border-white/15 bg-secondary px-4 py-3 text-left text-primary-foreground shadow-lg transition-colors hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-white/70 aria-pressed:bg-neutral-800"
					onclick={() => select(place, index)}
				>
					<span
						id={`${widgetId}-details-${index}`}
						class="flex items-center justify-between gap-2 text-xs font-medium"
					>
						<span class="flex items-center gap-2 text-primary-foreground/75">
							<span
								class="flex size-6 items-center justify-center rounded-full bg-white/10 text-xs tabular-nums"
								>{index + 1}</span
							>
							<span class="capitalize"
								>{labels.slice(0, 2).join(' · ') ||
									(place.categories?.includes('catering.cafe') ? 'Café' : 'Restaurant')}</span
							>
						</span>
						{#if selectedId === place.id}
							<span aria-hidden="true"
								><SFIcon icon="checkmark-circle-fill" size="md" weight="medium" /></span
							>
						{/if}
					</span>
					<span class="text-base leading-snug font-semibold tracking-tight text-balance"
						>{place.name}</span
					>
					{#if typeof place.address === 'string' && place.address.trim()}
						<span
							class="line-clamp-2 text-xs leading-relaxed text-primary-foreground/70"
							title={place.address}>{place.address}</span
						>
					{/if}
					{#if matches}
						<span class="mt-auto text-xs font-medium text-emerald-300"
							><span class="capitalize">{matchedCuisine}</span> match</span
						>
					{/if}
				</button>
			{/each}
		</div>
		<div
			class="pointer-events-auto flex flex-wrap gap-x-2 px-2 pb-1 text-[10px] leading-4 text-white/75"
		>
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
		width: 26px;
		height: 26px;
		border: 2px solid white;
		border-radius: 50%;
		background: #262626;
		color: white;
		font:
			600 12px/1 -apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		box-shadow: 0 1px 5px #0008;
		cursor: pointer;
	}
	:global(.map-place-marker[data-selected='true']) {
		background: #f7f6f1;
		color: #262626;
		border-color: #262626;
		width: 30px;
		height: 30px;
	}
</style>
