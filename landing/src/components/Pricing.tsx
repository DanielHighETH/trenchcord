import { Check, Sparkles } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

const ACCOUNT_URL = 'https://dashboard.trenchcord.app';

interface PlanCard {
  name: string;
  price: string;
  perMonth: string;
  featured?: boolean;
}

const plans: PlanCard[] = [
  { name: '1 month', price: '0.99', perMonth: '0.99 SOL / month' },
  { name: '3 months', price: '2.79', perMonth: '0.93 SOL / month' },
  { name: '12 months', price: '9.49', perMonth: '0.79 SOL / month', featured: true },
];

const included = [
  'Full desktop app — every feature, every update',
  'iPhone app included — in beta, installed via TestFlight',
  'Up to 3 linked devices — desktop and phone count as one sub',
  '@Trencher role on our Discord — private member chats included',
  'Pay from any wallet or exchange — no card, no sign-up forms',
  'Your Discord & Telegram data never touches our servers',
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-20 px-6 scroll-mt-14">
      <div className="mx-auto max-w-4xl">
        <AnimatedSection className="text-center mb-10">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">Simple pricing, paid in SOL</h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            One on-chain payment, straight from your trading wallet. No card, no auto-renew —
            your time is added the moment the transaction confirms.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-lg border p-6 ${
                  plan.featured
                    ? 'border-dc-blurple bg-dc-blurple/5 shadow-lg shadow-dc-blurple/10'
                    : 'border-dc-divider bg-dc-sidebar'
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-dc-blurple px-3 py-1 text-[11px] font-semibold text-white">
                    <Sparkles size={11} />
                    Best value · 20% off
                  </span>
                )}
                <h3 className="text-sm font-semibold uppercase tracking-wide text-dc-text-muted">{plan.name}</h3>
                <p className="mt-3 text-3xl font-extrabold text-dc-solana">
                  {plan.price} <span className="text-base font-semibold">SOL</span>
                </p>
                <p className="mt-1 text-xs text-dc-text-faint">{plan.perMonth}</p>
                <a
                  href={ACCOUNT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-6 inline-flex items-center justify-center rounded px-4 py-2.5 text-sm font-medium transition-colors ${
                    plan.featured
                      ? 'bg-dc-blurple text-white hover:bg-dc-blurple-hover'
                      : 'border border-dc-divider bg-dc-dark text-dc-text hover:bg-dc-hover hover:border-dc-text-faint'
                  }`}
                >
                  Get started
                </a>
              </div>
            ))}
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="mt-8 mx-auto max-w-2xl rounded-lg border border-dc-divider bg-dc-dark p-5">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-dc-text-muted leading-relaxed">
                  <Check size={14} className="text-dc-green shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-center text-xs text-dc-text-faint">
            Buying while your subscription is active extends it — stack as much time as you like.
            Manage everything at{' '}
            <a href={ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className="text-dc-blurple hover:underline">
              dashboard.trenchcord.app
            </a>
            .
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
