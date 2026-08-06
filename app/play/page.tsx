import { Suspense } from 'react';
import JoinForm from './JoinForm';

export default function JoinPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <JoinForm />
    </Suspense>
  );
}
