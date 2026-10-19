import { spaceOf } from '../../lib/spaces';
import { SpacePage } from '../spaces/space-page';

export default function EnglishPage() {
  return <SpacePage space={spaceOf('Vocabulary')} />;
}
