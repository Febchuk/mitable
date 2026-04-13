"use client";

export default function Error({ error: _error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4 text-white">
            <h2 className="mb-4 text-2xl font-semibold">Something went wrong</h2>
            <p className="mb-8 max-w-md text-center text-gray-400">An unexpected error occurred. Please try again.</p>
            <button onClick={reset} className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-gray-950 transition hover:bg-gray-200">
                Try again
            </button>
        </div>
    );
}
