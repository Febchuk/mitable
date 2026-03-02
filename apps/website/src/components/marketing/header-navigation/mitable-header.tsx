"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu01, X } from "@untitledui/icons";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { MitableLogo } from "@/components/foundations/logo/mitable-logo";
import { MitableLogoMinimal } from "@/components/foundations/logo/mitable-logo";
import { siteContent } from "@/config/site-content";
import { supabase } from "@/lib/supabase";
import { cx } from "@/utils/cx";

const signedInLinks = [
    { label: "Billing", href: "/billing" },
    { label: "Pricing", href: "/pricing" },
];

type NavItem = {
    label: string;
    href: string;
};

const MobileNavItem = ({ label, href }: NavItem) => {
    return (
        <li>
            <a href={href} className="flex items-center justify-between px-4 py-3 text-md font-semibold text-gray-200 hover:bg-gray-800">
                {label}
            </a>
        </li>
    );
};

const MobileFooter = ({ isSignedIn, onSignOut }: { isSignedIn: boolean; onSignOut: () => void }) => {
    const { navigation } = siteContent;

    return (
        <div className="flex flex-col gap-3 border-t border-gray-800 px-4 py-6">
            {isSignedIn ? (
                <Button size="lg" className="rounded-full" onPress={onSignOut}>
                    Sign Out
                </Button>
            ) : (
                <Button size="lg" href="/login" className="rounded-full">
                    Sign In
                </Button>
            )}
            <Button color="primary" size="lg" href="/download" className="rounded-full">
                {navigation.cta}
            </Button>
        </div>
    );
};

interface MitableHeaderProps {
    className?: string;
}

export const MitableHeader = ({ className }: MitableHeaderProps) => {
    const headerRef = useRef<HTMLElement>(null);
    const router = useRouter();
    const { navigation } = siteContent;
    const [isSignedIn, setIsSignedIn] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsSignedIn(!!session);
        });
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setIsSignedIn(false);
        router.push("/");
    };

    const navLinks = isSignedIn ? signedInLinks : navigation.links;

    return (
        <header
            ref={headerRef}
            className={cx(
                "fixed top-0 right-0 left-0 z-50 flex h-18 w-full items-center justify-center md:h-20",
                "border-b border-gray-800/50 bg-ink/80 backdrop-blur-xl",
                className,
            )}
        >
            <div className="flex size-full max-w-container flex-1 items-center pr-3 pl-4 md:px-8">
                <div className="flex w-full justify-between gap-4">
                    <div className="flex flex-1 items-center gap-8">
                        {/* Logo */}
                        <a href="/" className="outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
                            <MitableLogo className="h-8 text-white md:max-lg:hidden" />
                            <MitableLogoMinimal className="hidden h-8 text-white md:inline-block lg:hidden" />
                        </a>

                        {/* Desktop navigation */}
                        <nav className="max-md:hidden">
                            <ul className="flex items-center gap-1">
                                {navLinks.map((item) => (
                                    <li key={item.label}>
                                        <a
                                            href={item.href}
                                            className="flex cursor-pointer items-center gap-0.5 rounded-lg px-3 py-2 text-md font-semibold text-gray-300 outline-focus-ring transition duration-100 ease-linear hover:text-white focus:outline-offset-2 focus-visible:outline-2"
                                        >
                                            {item.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>

                    {/* Desktop CTA */}
                    <div className="hidden items-center gap-3 md:flex">
                        {isSignedIn ? (
                            <button
                                onClick={handleSignOut}
                                className="cursor-pointer rounded-lg px-3 py-2 text-md font-semibold text-gray-300 transition duration-100 ease-linear hover:text-white"
                            >
                                Sign Out
                            </button>
                        ) : (
                            <a
                                href="/login"
                                className="rounded-lg px-3 py-2 text-md font-semibold text-gray-300 transition duration-100 ease-linear hover:text-white"
                            >
                                Sign In
                            </a>
                        )}
                        <Button color="primary" size="lg" href="/download" className="rounded-full">
                            {navigation.cta}
                        </Button>
                    </div>

                    {/* Mobile menu trigger */}
                    <AriaDialogTrigger>
                        <AriaButton
                            aria-label="Toggle navigation menu"
                            className={({ isFocusVisible, isHovered }) =>
                                cx(
                                    "group ml-auto cursor-pointer rounded-lg p-2 md:hidden",
                                    isHovered && "bg-gray-800",
                                    isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring",
                                )
                            }
                        >
                            <Menu01 className="size-6 text-gray-300 group-aria-expanded:hidden" />
                            <X className="hidden size-6 text-gray-300 group-aria-expanded:block" />
                        </AriaButton>

                        <AriaPopover
                            triggerRef={headerRef}
                            className="h-calc(100%-72px) scrollbar-hide w-full overflow-y-auto shadow-lg md:hidden"
                            offset={0}
                            crossOffset={20}
                            containerPadding={0}
                            placement="bottom left"
                        >
                            <AriaDialog className="outline-hidden">
                                <nav className="w-full bg-ink shadow-lg">
                                    <ul className="flex flex-col gap-0.5 py-5">
                                        {navLinks.map((item) => (
                                            <MobileNavItem key={item.label} {...item} />
                                        ))}
                                    </ul>
                                    <MobileFooter isSignedIn={isSignedIn} onSignOut={handleSignOut} />
                                </nav>
                            </AriaDialog>
                        </AriaPopover>
                    </AriaDialogTrigger>
                </div>
            </div>
        </header>
    );
};
