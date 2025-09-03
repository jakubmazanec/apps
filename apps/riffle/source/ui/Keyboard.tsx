// import React, {FunctionComponent, useState, MutableRefObject} from 'react';
// import * as KeyboardModule from 'react-simple-keyboard';
// import 'react-simple-keyboard/build/css/index.css';

// export interface KeyboardOptions {
//   onChange: (input: string) => void;
//   keyboardRef: MutableRefObject<typeof KeyboardModule.KeyboardReact>;
// }

// export function Keyboard({onChange, keyboardRef}: KeyboardOptions) {
//   const [layoutName, setLayoutName] = useState('default');

//   const onKeyPress = (button: string) => {
//     if (button === '{shift}' || button === '{lock}') {
//       setLayoutName(layoutName === 'default' ? 'shift' : 'default');
//     }
//   };

//   console.log('KeyboardModule', KeyboardModule);

//   return (
//     <KeyboardModule.KeyboardReact
//       keyboardRef={(r) => (keyboardRef.current = r)}
//       layoutName={layoutName}
//       onChange={onChange}
//       onKeyPress={onKeyPress}
//       onRender={() => console.log('Rendered')}
//     />
//   );
// }

import * as React from 'react';
import {SimpleKeyboard} from 'simple-keyboard/build/index.modern.js';

import 'simple-keyboard/build/css/index.css';

export const parseProps = (props: KeyboardReactInterface['options']) => ({
  ...props,
  theme: `simple-keyboard ${props.theme ?? 'hg-theme-default'}`,
});

const cleanProps = (sourceObj: KeyboardReactInterface['options']) => ({
  ...sourceObj,
  keyboardRef: null,
});

export const changedProps = (
  prevProps: KeyboardReactInterface['options'],
  props: KeyboardReactInterface['options'],
) => {
  const cleanedProps = cleanProps(props);
  const cleanedPrevProps = cleanProps(prevProps);

  return Object.keys(cleanedProps).filter(
    // TODO: fix
    // @ts-expect-error -- temp
    (propName) => cleanedProps[propName] !== cleanedPrevProps[propName],
  );
};

export interface KeyboardReactInterface extends SimpleKeyboard {
  options: SimpleKeyboard['options'] & {
    keyboardRef?: React.RefObject<SimpleKeyboard | null>;
  };
}

export function Keyboard(props: KeyboardReactInterface['options']) {
  // TODO: fix
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- temp
  const cssClass = props.baseClass ?? 'react-simple-keyboard';
  const initRef = React.useRef<boolean | null>(null);
  const targetElemRef = React.useRef<HTMLDivElement | null>(null);
  const keyboardRef = React.useRef<KeyboardReactInterface | null>(null);
  const previousProps = React.useRef(props);

  React.useEffect(() => {
    /**
     * Whenever this component is unmounted, ensure that Keyboard object that
     * it created is destroyed so that it removes any event handlers that it
     * may have installed.
     */
    return () => {
      if (keyboardRef.current) {
        keyboardRef.current.destroy();
      }
      initRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    // TODO: fix
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- temp
    const parsedProps = parseProps(props) as any;

    /**
     * Initialize simple-keyboard
     */
    if (!initRef.current) {
      initRef.current = true;
      // TODO: fix
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access -- temp
      parsedProps.debug && console.log('ReactSimpleKeyboard: Init');
      const targetElem = targetElemRef.current as HTMLDivElement;
      const targetClass = `.${cssClass}`;
      keyboardRef.current = new SimpleKeyboard(
        // TODO: fix
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- temp
        targetElem || targetClass,
        // TODO: fix
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- temp
        parsedProps,
      ) as KeyboardReactInterface;

      // if (parsedProps.keyboardRef) {
      //   parsedProps.keyboardRef.current = keyboardRef.current;
      // }
    }

    // TODO: fix
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- temp
    const updatedProps = changedProps(previousProps.current, parsedProps);

    /**
     * Only trigger render if props changed
     */
    if (updatedProps.length) {
      const keyboard = keyboardRef.current;
      // TODO: fix
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- temp
      previousProps.current = parsedProps;
      // TODO: fix
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- temp
      keyboard?.setOptions(parsedProps);
      // TODO: fix
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access -- temp
      parsedProps.debug &&
        console.log('ReactSimpleKeyboard - setOptions called due to updated props:', updatedProps);
    }
  }, [initRef, cssClass, previousProps, props]);

  // TODO: fix
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- temp
  return <div ref={targetElemRef} className={cssClass} />;
}
