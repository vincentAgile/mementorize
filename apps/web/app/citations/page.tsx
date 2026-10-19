import { spaceOf } from '../../lib/spaces';
import { SpacePage } from '../spaces/space-page';

export default function CitationsPage() {
  return <SpacePage space={spaceOf('Quote')} />;
}
