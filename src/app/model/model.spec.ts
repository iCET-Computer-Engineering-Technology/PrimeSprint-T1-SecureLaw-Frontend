import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Model } from './model';

describe('Model', () => {
  let component: Model;
  let fixture: ComponentFixture<Model>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Model]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Model);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
