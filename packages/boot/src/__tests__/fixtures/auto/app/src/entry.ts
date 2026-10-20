import AutoArtifacts from '../../../../../bun/auto';

const index = await AutoArtifacts.resolve();
console.log(
  `entry-root=${Object.values(index)
    .flat()
    .map(target => target.name)
    .sort()
    .join(',')}`,
);
