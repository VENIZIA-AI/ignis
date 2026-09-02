import {
  component,
  controller,
  datasource,
  injectable,
  model,
  provide,
  service,
} from '@/base/metadata';
import { ArtifactTypes, BindingScopes, MetadataRegistry } from '@/helpers/inversion';
import { describe, expect, test } from 'bun:test';

const artifactOf = (target: object) =>
  MetadataRegistry.getInstance().getArtifactMetadata({ target });

describe('@injectable and its stereotypes', () => {
  test('@injectable records exactly what it was given', () => {
    const when = () => true;
    @injectable({ type: ArtifactTypes.SERVICE, scope: BindingScopes.SINGLETON, order: 2, when })
    class Probe {}

    expect(artifactOf(Probe)).toEqual({
      type: ArtifactTypes.SERVICE,
      scope: BindingScopes.SINGLETON,
      order: 2,
      when,
    });
  });

  test('an unknown artifact type is refused at decoration time', () => {
    expect(() => injectable({ type: 'widget' as never })(class Widget {})).toThrow(
      "[injectable][Widget] Invalid artifact type: 'widget'",
    );
  });

  test('@service and @component fix the type and forward the options', () => {
    @service({ binding: { namespace: 'services', key: 'Custom' } })
    class Svc {}
    @component()
    class Cmp {}

    expect(artifactOf(Svc)).toEqual({
      type: ArtifactTypes.SERVICE,
      binding: { namespace: 'services', key: 'Custom' },
    });
    expect(artifactOf(Cmp)).toEqual({ type: ArtifactTypes.COMPONENT });
  });

  test('@controller composes @injectable and keeps its own metadata free of registration fields', () => {
    @controller({ path: '/probes', scope: BindingScopes.SINGLETON, allowOverride: false })
    class ProbeController {}

    expect(artifactOf(ProbeController)).toEqual({
      type: ArtifactTypes.CONTROLLER,
      scope: BindingScopes.SINGLETON,
      allowOverride: false,
    });
    expect(
      MetadataRegistry.getInstance().getControllerMetadata({ target: ProbeController }),
    ).toEqual({ path: '/probes' });
  });

  test('@datasource and @model compose @injectable with their own type', () => {
    @datasource()
    class ProbeDataSource {}
    @model({ type: 'entity' })
    class ProbeModel {}

    expect(artifactOf(ProbeDataSource)?.type).toBe(ArtifactTypes.DATASOURCE);
    expect(artifactOf(ProbeModel)?.type).toBe(ArtifactTypes.MODEL);
  });

  test('@provide records one entry per method, on the class', () => {
    class Holder {
      @provide({ key: 'options.alpha' })
      alpha(): number {
        return 1;
      }

      @provide({ key: 'options.beta', scope: BindingScopes.TRANSIENT })
      beta(): number {
        return 2;
      }
    }

    expect(MetadataRegistry.getInstance().getProvideMetadata({ target: Holder })).toEqual([
      { methodName: 'alpha', key: 'options.alpha' },
      { methodName: 'beta', key: 'options.beta', scope: BindingScopes.TRANSIENT },
    ]);
  });
});
