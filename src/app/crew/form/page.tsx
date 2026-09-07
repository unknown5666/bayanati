import { CrewForm } from '@/components/form/CrewForm';

export const metadata = {
  title: 'Crew Intake — Bayanati',
};

export default function CrewFormPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <CrewForm />
    </main>
  );
}
