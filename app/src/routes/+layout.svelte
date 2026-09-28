<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { DropdownMenu } from 'bits-ui';
	import SFIcon from '@alexdev404/sficons-svelte';
	import Check from '@lucide/svelte/icons/check';
	import Calendar from '@lucide/svelte/icons/calendar';
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
	let signOutForm = $state<HTMLFormElement>();
</script>

{#snippet calendarStack(connected: boolean)}
	<span class="relative inline-flex size-8 items-center justify-center">
		<span aria-hidden="true" class="absolute -top-1.5 -left-1.5 flex size-8 items-start justify-center rounded-[10px] bg-primary-foreground/45 pt-1 text-primary/60">
			<Calendar size={16} strokeWidth={1.5} />
		</span>
		<span class="relative inline-flex size-8 items-center justify-center rounded-[10px] bg-primary-foreground text-primary">
			<img src="/brands/google.svg" alt="" class="size-4" />
		</span>
		{#if connected}
			<Check size={14} strokeWidth={3} aria-hidden="true" class="absolute -right-1 -bottom-0.5 text-emerald-400" />
		{/if}
	</span>
{/snippet}

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
						href="/?passport=1"
						onclick={() => (sidebarOpen = window.innerWidth >= 640)}
						class="mt-4 rounded-xl px-3 py-2 text-sm text-primary-foreground/60 hover:bg-secondary"
						>Your passport</a
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
						<div class="flex items-center gap-3">
							{#if page.url.pathname === '/' && page.data.googleEnabled}
								{#if page.data.calendarConnected}
									<span
										aria-label="Google Calendar connected"
										title="Google Calendar connected"
										class="inline-flex min-h-11 items-center gap-1.5"
									>
										{@render calendarStack(true)}
									</span>
								{:else}
									<form method="post" action="/?/connectCalendar">
										<button
											type="submit"
											aria-label="Connect Google Calendar"
											title="Connect Google Calendar"
											class="inline-flex size-11 items-center justify-center rounded-xl hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] motion-reduce:transition-none"
										>
											{@render calendarStack(false)}
										</button>
									</form>
								{/if}
							{/if}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									aria-label="Account"
									class="flex cursor-pointer list-none items-center rounded-full text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
								>
									<Avatar.Root class="size-9 ring-1 ring-primary-foreground/20" aria-hidden="true">
										{#if data.user.image}<Avatar.Image src={data.user.image} alt="" />{/if}
										<Avatar.Fallback class="bg-primary-foreground text-xs font-medium text-primary">
											{data.user.name.trim().charAt(0).toUpperCase() || 'G'}
										</Avatar.Fallback>
									</Avatar.Root>
								</DropdownMenu.Trigger>
								<DropdownMenu.Portal>
									<DropdownMenu.Content
										align="end"
										sideOffset={12}
										class="z-50 w-64 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-[#1c1c1e] p-1.5 text-primary-foreground shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_16px_48px_rgb(0_0_0/0.4)] outline-none"
									>
										<div class="px-3 py-3">
											<p class="truncate text-sm font-medium">{data.user.name}</p>
											<p class="mt-1 truncate text-xs text-primary-foreground/50">
												{data.user.email}
											</p>
										</div>
										<DropdownMenu.Item
											class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm outline-none data-highlighted:bg-primary-foreground/8"
										>
											{#snippet child({ props })}
												<a {...props} href="/?passport=1"
													><SFIcon icon="person-crop-circle" size="sm" />Your passport<span
														class="ml-auto text-primary-foreground/40"
														><SFIcon icon="chevron-right" size="sm" /></span
													></a
												>
											{/snippet}
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onSelect={() => signOutForm?.requestSubmit()}
											class="mt-1 flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm text-primary-foreground/55 outline-none data-highlighted:bg-primary-foreground/8 data-highlighted:text-primary-foreground"
											>Sign out</DropdownMenu.Item
										>
									</DropdownMenu.Content>
								</DropdownMenu.Portal>
							</DropdownMenu.Root>
							<form bind:this={signOutForm} method="post" action="/?/signOut" hidden></form>
						</div>
					{/if}
				</header>
				{@render children()}
			</div>
		</div>
	</div>
{/if}
