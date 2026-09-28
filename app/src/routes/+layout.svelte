<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import SFIcon from '@alexdev404/sficons-svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import './layout.css';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let sidebarOpen = $state(false);
	let extraThreads = $state<Array<{ id: string; title: string }>>([]);
	let nextThreadCursor = $state(untrack(() => data.nextThreadCursor));
	let loadingThreads = $state(false);
	let historyFailure = $state<string | null>(null);
	let sidebarThreads = $derived([
		...new Map([...data.threads, ...extraThreads].map((thread) => [thread.id, thread])).values()
	]);
	$effect(() => {
		const cursor = data.nextThreadCursor;
		untrack(() => {
			extraThreads = [];
			nextThreadCursor = cursor;
		});
	});
	async function loadMoreThreads() {
		if (!nextThreadCursor || loadingThreads) return;
		loadingThreads = true;
		historyFailure = null;
		try {
			const response = await fetch(`/api/chats?cursor=${encodeURIComponent(nextThreadCursor)}`);
			if (!response.ok) throw new Error('Could not load chats.');
			const result = await response.json();
			extraThreads = [...extraThreads, ...result.threads];
			nextThreadCursor = result.nextCursor;
		} catch {
			historyFailure = 'Could not load earlier chats. Try again.';
		} finally {
			loadingThreads = false;
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') sidebarOpen = false;
	}}
/>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<div
		class="min-h-dvh bg-primary text-primary-foreground"
		class:h-dvh={page.url.pathname === '/'}
		class:overflow-hidden={page.url.pathname === '/'}
	>
		{#if data.user}
			<button
				type="button"
				class="fixed top-5 left-3 z-40 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground/70 hover:bg-secondary"
				aria-label={sidebarOpen ? 'Close chats' : 'Open chats'}
				aria-expanded={sidebarOpen}
				aria-controls="chat-sidebar"
				onclick={() => (sidebarOpen = !sidebarOpen)}
			>
				<SFIcon icon="sidebar-left" size="md" />
			</button>
			{#if sidebarOpen}
				<button
					type="button"
					aria-label="Close chats"
					class="fixed inset-0 z-20 bg-black/50 sm:hidden"
					onclick={() => (sidebarOpen = false)}
				></button>
				<aside
					id="chat-sidebar"
					class="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-[#141414] px-3 pt-20 pb-5 shadow-xl"
				>
					<a href="/" class="absolute top-7 left-16 text-lg tracking-wide">concierge</a>
					<button
						type="button"
						class="mb-6 rounded-xl px-3 py-3 text-left text-sm hover:bg-secondary disabled:opacity-50"
						onclick={() => {
							sidebarOpen = false;
							void goto('/', { invalidateAll: true });
						}}
						>New chat <span aria-hidden="true" class="float-right"
							><SFIcon icon="plus" size="sm" /></span
						></button
					>
					<nav aria-label="Chats" class="flex-1 space-y-1 overflow-y-auto">
						{#each sidebarThreads as thread (thread.id)}
							<a
								href={`/?chat=${thread.id}`}
								aria-current={page.url.searchParams.get('chat') === thread.id &&
								!page.url.searchParams.has('passport')
									? 'page'
									: undefined}
								class="block truncate rounded-xl px-3 py-2.5 text-sm text-primary-foreground/75 hover:bg-secondary aria-[current=page]:bg-secondary"
								onclick={() => (sidebarOpen = window.innerWidth >= 640)}>{thread.title}</a
							>
						{/each}
						{#if nextThreadCursor}<button
								type="button"
								class="w-full rounded-xl px-3 py-2 text-left text-xs text-primary-foreground/60"
								disabled={loadingThreads}
								onclick={() => void loadMoreThreads()}>Earlier chats</button
							>{/if}
						{#if historyFailure}<p role="alert" class="px-3 text-xs text-destructive">
								{historyFailure}
							</p>{/if}
					</nav>
					<a
						href="/onboarding?edit=1"
						class="mt-4 rounded-xl px-3 py-2 text-sm text-primary-foreground/60 hover:bg-secondary"
						>Your preferences</a
					>
				</aside>
			{/if}
		{/if}
		<div
			class="transition-[padding] motion-reduce:transition-none"
			class:sm:pl-60={sidebarOpen && !!data.user}
		>
			<div
				class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 sm:px-8"
				class:h-dvh={page.url.pathname === '/'}
			>
				<header
					class="app-header flex shrink-0 items-center justify-between py-5"
					class:pl-10={!!data.user}
				>
					<a href={resolve('/')} class="text-lg tracking-wide" class:invisible={sidebarOpen}
						>concierge</a
					>
					{#if data.user}
						<details class="relative">
							<summary
								aria-label="Account"
								class="flex cursor-pointer list-none items-center text-sm"
							>
								<Avatar.Root class="size-9 ring-1 ring-primary-foreground/20" aria-hidden="true">
									{#if data.user.image}<Avatar.Image src={data.user.image} alt="" />{/if}
									<Avatar.Fallback class="bg-primary-foreground text-xs font-medium text-primary">
										{data.user.name.trim().charAt(0).toUpperCase() || 'G'}
									</Avatar.Fallback>
								</Avatar.Root>
							</summary>
							<div
								class="absolute top-full right-0 z-10 mt-3 min-w-48 rounded-lg border border-primary-foreground/20 bg-primary p-4 shadow-xl"
							>
								<p class="mb-3 text-xs text-primary-foreground/60">{data.user.email}</p>
								<a href="/?passport=1" class="mb-3 block text-sm hover:underline">Your passport</a>
								<a href="/onboarding?edit=1" class="mb-3 block text-sm hover:underline"
									>Your preferences</a
								>
								<form method="post" action="/?/signOut">
									<button class="text-sm underline underline-offset-4">Sign out</button>
								</form>
							</div>
						</details>
					{/if}
				</header>
				{@render children()}
			</div>
		</div>
	</div>
{/if}
