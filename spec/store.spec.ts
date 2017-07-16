import 'rxjs/add/operator/take';
import { Subscription } from 'rxjs/Subscription';
import { ReflectiveInjector } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { StoreModule, Store, State, ActionReducer } from '@ngrx/store';

import { StoreDevtools, StoreDevtoolsModule, LiftedState, StoreDevtoolsConfig } from '../';

const counter = jasmine.createSpy('counter').and.callFake(function (state = 0, action) {
  switch (action.type) {
  case 'INCREMENT': return state + 1;
  case 'DECREMENT': return state - 1;
  default: return state;
  }
});

declare var mistake;
function counterWithBug(state = 0, action) {
  switch (action.type) {
    case 'INCREMENT': return state + 1;
    case 'DECREMENT': return mistake - 1; // mistake is undefined
    case 'SET_UNDEFINED': return undefined;
    default: return state;
  }
}

function counterWithAnotherBug(state = 0, action) {
  switch (action.type) {
    case 'INCREMENT': return mistake + 1; // eslint-disable-line no-undef
    case 'DECREMENT': return state - 1;
    case 'SET_UNDEFINED': return undefined;
    default: return state;
  }
}

function doubleCounter(state = 0, action) {
  switch (action.type) {
    case 'INCREMENT': return state + 2;
    case 'DECREMENT': return state - 2;
    default: return state;
  }
}

type Fixture<T> = {
  store: Store<T>;
  state: State<T>;
  devtools: StoreDevtools;
  cleanup: () => void;
  getState: () => T;
  getLiftedState: () => LiftedState;
  replaceReducer: (reducer) => void;
};

function createStore<T>(reducer: ActionReducer<T>, options: StoreDevtoolsConfig = {}): Fixture<T> {
  TestBed.configureTestingModule({
    imports: [
      StoreModule.provideStore(reducer),
      StoreDevtoolsModule.instrumentStore(options)
    ]
  });

  const testbed: TestBed = getTestBed();
  const store: Store<T> = testbed.get(Store);
  const devtools: StoreDevtools = testbed.get(StoreDevtools);
  const state: State<T> = testbed.get(State);
  let liftedValue: LiftedState;
  let value: T;

  const liftedStateSub = devtools.liftedState.subscribe(s => liftedValue = s);
  const stateSub = devtools.state.subscribe(s => value = s);

  const getState = (): T => value;
  const getLiftedState = (): LiftedState => liftedValue;

  const cleanup = () => {
    liftedStateSub.unsubscribe();
    stateSub.unsubscribe();
  };

  const replaceReducer = reducer => {
    store.replaceReducer(reducer);
  };


  return { store, state, devtools, cleanup, getState, getLiftedState, replaceReducer };
}

describe('Store Devtools', () => {
  describe('Instrumentation', () => {
    let fixture: Fixture<number>;
    let store: Store<number>;
    let devtools: StoreDevtools;
    let getState: () => number;
    let getLiftedState: () => LiftedState;

    beforeEach(() => {
      fixture = createStore(counter);
      store = fixture.store;
      devtools = fixture.devtools;
      getState = fixture.getState;
      getLiftedState = fixture.getLiftedState;
    });

    afterEach(() => {
      fixture.cleanup();
    });

    it('should alias devtools unlifted state to Store\'s state', () => {
      expect(devtools.state).toBe(fixture.state);
    });

    it('should perform actions', () => {
      expect(getState()).toBe(0);
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(1);
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(2);
    });

    it('should rollback state to the last committed state', () => {
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(2);

      devtools.commit();
      expect(getState()).toBe(2);

      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(4);

      devtools.rollback();
      expect(getState()).toBe(2);

      store.dispatch({ type: 'DECREMENT' });
      expect(getState()).toBe(1);

      devtools.rollback();
      expect(getState()).toBe(2);
    });

    it('should reset to initial state', () => {
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(1);

      devtools.commit();
      expect(getState()).toBe(1);

      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(2);

      devtools.rollback();
      expect(getState()).toBe(1);

      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(2);

      devtools.reset();
      expect(getState()).toBe(0);
    });

    it('should toggle an action', () => {
      // actionId 0 = @@INIT
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'DECREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(1);

      devtools.toggleAction(2);
      expect(getState()).toBe(2);

      devtools.toggleAction(2);
      expect(getState()).toBe(1);
    });

    it('should sweep disabled actions', () => {
      // actionId 0 = @@INIT
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'DECREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      expect(getState()).toBe(2);
      expect(getLiftedState().stagedActionIds).toEqual([0, 1, 2, 3, 4]);
      expect(getLiftedState().skippedActionIds).toEqual([]);

      devtools.toggleAction(2);

      expect(getState()).toBe(3);
      expect(getLiftedState().stagedActionIds).toEqual([0, 1, 2, 3, 4]);
      expect(getLiftedState().skippedActionIds).toEqual([2]);

      devtools.sweep();
      expect(getState()).toBe(3);
      expect(getLiftedState().stagedActionIds).toEqual([0, 1, 3, 4]);
      expect(getLiftedState().skippedActionIds).toEqual([]);
    });

    it('should jump to state', () => {
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'DECREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(1);

      devtools.jumpToState(0);
      expect(getState()).toBe(0);

      devtools.jumpToState(1);
      expect(getState()).toBe(1);

      devtools.jumpToState(2);
      expect(getState()).toBe(0);

      store.dispatch({ type: 'INCREMENT' });
      expect(getState()).toBe(0);

      devtools.jumpToState(4);
      expect(getState()).toBe(2);
    });

    it('should replace the reducer', () => {
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'DECREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      expect(getState()).toBe(1);

      fixture.replaceReducer(doubleCounter);

      expect(getState()).toBe(2);
    });

    it('should catch and record errors', () => {
      spyOn(console, 'error');
      fixture.replaceReducer(counterWithBug);

      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'DECREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      let { computedStates } = fixture.getLiftedState();
      expect(computedStates[2].error).toMatch(
        /ReferenceError/
      );
      expect(computedStates[3].error).toMatch(
        /Interrupted by an error up the chain/
      );

      expect(console.error).toHaveBeenCalled();
    });

    it('should catch invalid action type', () => {
      expect(() => {
        store.dispatch({ type: undefined });
      }).toThrowError(
        'Actions may not have an undefined "type" property. ' +
        'Have you misspelled a constant?'
      );
    });

    it('should not recompute old states when toggling an action', () => {
      counter.calls.reset();

      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      expect(counter).toHaveBeenCalledTimes(3);

      devtools.toggleAction(3);
      expect(counter).toHaveBeenCalledTimes(3);

      devtools.toggleAction(3);
      expect(counter).toHaveBeenCalledTimes(4);

      devtools.toggleAction(2);
      expect(counter).toHaveBeenCalledTimes(5);

      devtools.toggleAction(2);
      expect(counter).toHaveBeenCalledTimes(7);

      devtools.toggleAction(1);
      expect(counter).toHaveBeenCalledTimes(9);

      devtools.toggleAction(2);
      expect(counter).toHaveBeenCalledTimes(10);

      devtools.toggleAction(3);
      expect(counter).toHaveBeenCalledTimes(10);

      devtools.toggleAction(1);
      expect(counter).toHaveBeenCalledTimes(11);

      devtools.toggleAction(3);
      expect(counter).toHaveBeenCalledTimes(12);

      devtools.toggleAction(2);
      expect(counter).toHaveBeenCalledTimes(14);
    });

    it('should not recompute states when jumping to state', () => {
      counter.calls.reset();

      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      expect(counter).toHaveBeenCalledTimes(3);

      let savedComputedStates = getLiftedState().computedStates;

      devtools.jumpToState(0);

      expect(counter).toHaveBeenCalledTimes(3);

      devtools.jumpToState(1);

      expect(counter).toHaveBeenCalledTimes(3);

      devtools.jumpToState(3);

      expect(counter).toHaveBeenCalledTimes(3);

      expect(getLiftedState().computedStates).toBe(savedComputedStates);
    });

    it('should not recompute states on monitor actions', () => {
      counter.calls.reset();

      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });
      store.dispatch({ type: 'INCREMENT' });

      expect(counter).toHaveBeenCalledTimes(3);

      let savedComputedStates = getLiftedState().computedStates;

      devtools.dispatch({ type: 'lol' });

      expect(counter).toHaveBeenCalledTimes(3);

      devtools.dispatch({ type: 'wat' });

      expect(counter).toHaveBeenCalledTimes(3);

      expect(getLiftedState().computedStates).toBe(savedComputedStates);
    });
  });


  describe('maxAge option', () => {
    it('should auto-commit earliest non-@@INIT action when maxAge is reached', () => {
      const fixture = createStore(counter, { maxAge: 3 });

      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });

      expect(fixture.getState()).toBe(2);
      expect(Object.keys(fixture.getLiftedState().actionsById).length).toBe(3);
      expect(fixture.getLiftedState().committedState).toBe(0);
      expect(fixture.getLiftedState().stagedActionIds.indexOf(1)).not.toBe(-1);

      // Trigger auto-commit.
      fixture.store.dispatch({ type: 'INCREMENT' });

      expect(fixture.getState()).toBe(3);
      expect(Object.keys(fixture.getLiftedState().actionsById).length).toBe(3);
      expect(fixture.getLiftedState().stagedActionIds.indexOf(1)).toBe(-1);
      expect(fixture.getLiftedState().computedStates[0].state).toBe(1);
      expect(fixture.getLiftedState().committedState).toBe(1);
      expect(fixture.getLiftedState().currentStateIndex).toBe(2);

      fixture.cleanup();
    });

    it('should remove skipped actions once committed', () => {
      const fixture = createStore(counter, { maxAge: 3 });

      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.devtools.toggleAction(1);
      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().skippedActionIds.indexOf(1)).not.toBe(-1);
      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().skippedActionIds.indexOf(1)).toBe(-1);

      fixture.cleanup();
    });

    it('should not auto-commit errors', () => {
      spyOn(console, 'error');
      const fixture = createStore(counterWithBug, { maxAge: 3 });

      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().stagedActionIds.length).toBe(3);

      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().stagedActionIds.length).toBe(4);

      fixture.cleanup();
    });

    it('should auto-commit actions after hot reload fixes error', () => {
      spyOn(console, 'error');
      const fixture = createStore(counterWithBug, { maxAge: 3 });

      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      expect(fixture.getLiftedState().stagedActionIds.length).toBe(7);

      // Auto-commit 2 actions by "fixing" reducer bug, but introducing another.
      fixture.store.replaceReducer(counterWithAnotherBug);
      expect(fixture.getLiftedState().stagedActionIds.length).toBe(5);

      // Auto-commit 2 more actions by "fixing" other reducer bug.
      fixture.store.replaceReducer(counter);
      expect(fixture.getLiftedState().stagedActionIds.length).toBe(3);

      fixture.cleanup();
    });

    it('should update currentStateIndex when auto-committing', () => {
      const fixture = createStore(counter, { maxAge: 3 });

      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });

      expect(fixture.getLiftedState().currentStateIndex).toBe(2);

      // currentStateIndex should stay at 2 as actions are committed.
      fixture.store.dispatch({ type: 'INCREMENT' });
      const liftedStoreState = fixture.getLiftedState();
      const currentComputedState = liftedStoreState.computedStates[liftedStoreState.currentStateIndex];

      expect(liftedStoreState.currentStateIndex).toBe(2);
      expect(currentComputedState.state).toBe(3);

      fixture.cleanup();
    });

    it('should continue to increment currentStateIndex while error blocks commit', () => {
      spyOn(console, 'error');
      const fixture = createStore(counterWithBug, { maxAge: 3 });

      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });

      let liftedStoreState = fixture.getLiftedState();
      let currentComputedState = liftedStoreState.computedStates[liftedStoreState.currentStateIndex];
      expect(liftedStoreState.currentStateIndex).toBe(4);
      expect(currentComputedState.state).toBe(0);
      expect(currentComputedState.error).toBeDefined();

      fixture.cleanup();
    });

    it('should adjust currentStateIndex correctly when multiple actions are committed', () => {
      spyOn(console, 'error');
      const fixture = createStore(counterWithBug, { maxAge: 3 });

      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });

      // Auto-commit 2 actions by "fixing" reducer bug.
      fixture.store.replaceReducer(counter);
      let liftedStoreState = fixture.getLiftedState();
      let currentComputedState = liftedStoreState.computedStates[liftedStoreState.currentStateIndex];
      expect(liftedStoreState.currentStateIndex).toBe(2);
      expect(currentComputedState.state).toBe(-4);

      fixture.cleanup();
    });

    it('should not allow currentStateIndex to drop below 0', () => {
      spyOn(console, 'error');
      const fixture = createStore(counterWithBug, { maxAge: 3 });

      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.devtools.jumpToState(1);

      // Auto-commit 2 actions by "fixing" reducer bug.
      fixture.store.replaceReducer(counter);
      let liftedStoreState = fixture.getLiftedState();
      let currentComputedState = liftedStoreState.computedStates[liftedStoreState.currentStateIndex];
      expect(liftedStoreState.currentStateIndex).toBe(0);
      expect(currentComputedState.state).toBe(-2);

      fixture.cleanup();
    });

    it('should throw error when maxAge < 2', () => {
      expect(() => {
        createStore(counter, { maxAge: 1 });
      }).toThrowError(/cannot be less than/);
    });

    it('should support a function to return devtools options', () => {
      expect(() => {
        createStore(counter, function() {
          return { maxAge: 1 };
        });
      }).toThrowError(/cannot be less than/);
    });
  });

  describe('Import State', () => {
    let fixture: Fixture<number>;
    let exportedState: LiftedState;

    beforeEach(() => {
      fixture = createStore(counter);

      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.store.dispatch({ type: 'INCREMENT' });

      exportedState = fixture.getLiftedState();
    });

    afterEach(() => {
      fixture.cleanup();
    });

    it('should replay all the steps when a state is imported', () => {
      fixture.devtools.importState(exportedState);
      expect(fixture.getLiftedState()).toEqual(exportedState);
    });

    it('should replace the existing action log with the one imported', () => {
      fixture.store.dispatch({ type: 'DECREMENT' });
      fixture.store.dispatch({ type: 'DECREMENT' });

      fixture.devtools.importState(exportedState);
      expect(fixture.getLiftedState()).toEqual(exportedState);
    });
  });

  describe('Lock Changes', () => {
    let fixture: Fixture<number>;

    beforeEach(() => {
      fixture = createStore(counter);
    });

    afterEach(() => {
      fixture.cleanup();
    });

    it('should lock', () => {
      fixture.store.dispatch({ type: 'INCREMENT' });
      fixture.devtools.lockChanges(true);
      expect(fixture.getLiftedState().dropNewActions).toBe(true);
      expect(fixture.getLiftedState().nextActionId).toBe(2);
      expect(fixture.getState()).toBe(1);

      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().nextActionId).toBe(2);
      expect(fixture.getState()).toBe(1);

      fixture.devtools.toggleAction(1);
      expect(fixture.getState()).toBe(0);
      fixture.devtools.toggleAction(1);
      expect(fixture.getState()).toBe(1);

      fixture.devtools.lockChanges(false);
      expect(fixture.getLiftedState().dropNewActions).toBe(false);
      expect(fixture.getLiftedState().nextActionId).toBe(2);

      fixture.store.dispatch({ type: 'INCREMENT' });
      expect(fixture.getLiftedState().nextActionId).toBe(3);
      expect(fixture.getState()).toBe(2);
    });
  });
});
