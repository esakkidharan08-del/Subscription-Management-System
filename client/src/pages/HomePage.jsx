import { useSession } from '../auth/useSession.js';

const nextUp = {
  admin: 'Catalog, subscriptions, billing and discounts will show up here.',
  staff: 'Subscriptions, invoices and payments will show up here.',
  customer: 'Your subscriptions and invoices will show up here.',
};

export default function HomePage() {
  const { user } = useSession();
  return (
    <section className="card">
      <h1>Welcome, {user.name}</h1>
      <p>{nextUp[user.role]}</p>
    </section>
  );
}
