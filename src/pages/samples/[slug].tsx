import dynamic from 'next/dynamic';
import { GetStaticPaths, GetStaticProps } from 'next';

type PathParams = {
  slug: string;
};

type Props = {
  slug: string;
};

export const pages = {
  animometer: dynamic(() => import('../../sample/animometer/main')),
  computeBoids: dynamic(() => import('../../sample/computeBoids/main')),
  deferredRendering: dynamic(() => import('../../sample/deferredRendering/main')),
  fractalCube: dynamic(() => import('../../sample/fractalCube/main')),
  helloTriangle: dynamic(() => import('../../sample/helloTriangle/main')),
  helloTriangleMSAA: dynamic(() => import('../../sample/helloTriangleMSAA/main')),
  imageBlur: dynamic(() => import('../../sample/imageBlur/main')),
  imageDenoise: dynamic(() => import('../../sample/imageDenoise/main')),
  imageHistogram: dynamic(() => import('../../sample/imageHistogram/main')),
  instancedCube: dynamic(() => import('../../sample/instancedCube/main')),
  particles: dynamic(() => import('../../sample/particles/main')),
  resizeCanvas: dynamic(() => import('../../sample/resizeCanvas/main')),
  reversedZ: dynamic(() => import('../../sample/reversedZ/main')),
  rotatingCube: dynamic(() => import('../../sample/rotatingCube/main')),
  shadowMapping: dynamic(() => import('../../sample/shadowMapping/main')),
  texturedCube: dynamic(() => import('../../sample/texturedCube/main')),
  textureIndex: dynamic(() => import('../../sample/textureIndex/main')),
  twoCubes: dynamic(() => import('../../sample/twoCubes/main')),
  videoUploading: dynamic(() => import('../../sample/videoUploading/main')),
};

function Page({ slug }: Props): JSX.Element {
  const PageComponent = pages[slug];
  return <PageComponent />;
}

export const getStaticPaths: GetStaticPaths<PathParams> = async () => {
  return {
    paths: Object.keys(pages).map((p) => {
      return { params: { slug: p } };
    }),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props, PathParams> = async ({
  params,
}) => {
  return {
    props: {
      ...params,
    },
  };
};

export default Page;
