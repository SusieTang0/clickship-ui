import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { EMPTY, from, of } from 'rxjs';
import { map, switchMap, catchError, take, mergeMap, filter, debounceTime } from 'rxjs/operators';
import { ParcelService } from './parcel.service';
import { ParcelActions } from './actions';
import { Store } from '@ngrx/store';
import { createShipmentRequestSelector, isValidPickupAddressSelector } from './selectors';
import { Router } from '@angular/router';
import { FromEnum } from '../models/shared.models';
export const PICKUP_ADDRESS = 'pickup-address';

@Injectable()
export class ParcelEffects {
	private actions$ = inject(Actions);
	private parcelService = inject(ParcelService);
	private store = inject(Store);
	private router = inject(Router);

	rateRequest$ = createEffect(() =>
		this.actions$.pipe(
			ofType(ParcelActions.rateRequest),
			switchMap((action) => {
				return this.parcelService.rateRquest(action.parcel).pipe(
					map((res) => {
						if (res.error) {
							return ParcelActions.setError({ error: res.message});
						}
						if (!res?.products?.length) {
							return ParcelActions.setError({ error: 'No matched product' });
						}

						const breakdown = res.products[0]?.detailedPriceBreakdown?.find((dpb: any) => dpb.currencyType === 'BILLC')?.breakdown?.find((bd: any) => bd?.name ==='EXPRESS WORLDWIDE');
						if (!breakdown?.priceBreakdown?.length || !breakdown.priceBreakdown[0]?.basePrice) {
							return ParcelActions.setError({ error: 'No Rate found' });
						}
						const price = breakdown.priceBreakdown[0]?.basePrice;
						const estimatedTransitDays = res.products[0]?.deliveryCapabilities?.totalTransitDays;
						return ParcelActions.setRateRequest({
							rateResponse: {
								rate: price,
								estimatedTransitDays,
							},
						})
					}),
					catchError((error) => of(ParcelActions.setError({error})))
				);
			})
		)
	);

	createShipment$ = createEffect(() =>
		this.actions$.pipe(
			ofType(ParcelActions.createShipment),
			switchMap((action) => {
				return this.store.select(createShipmentRequestSelector).pipe(
					take(1),
					switchMap((parcel) => {
						return this.parcelService.createShipment(parcel).pipe(
							mergeMap((res: any) => {
								if (res.error) {
									return of(ParcelActions.setError({ error: res.message}));
								}
								const documents = (res.documents || []).map((d: any) => d.content);
								const shipmentTrackingNumber = res.shipmentTrackingNumber;
								this.router.navigateByUrl(`shipments/${shipmentTrackingNumber}`);
								return from([
									ParcelActions.setRateRequest({ rateResponse: null }),
									ParcelActions.createShipemntSuccess({ documents, shipmentTrackingNumber  }),
								]);
							}),
							catchError((error) => of(ParcelActions.setError({error})))
						);
					})
				);
			})
		)
	);

	getPickupAddress$ = createEffect(() =>
		this.actions$.pipe(
			ofType(ParcelActions.getPickupAddress),
			mergeMap(() => {
				return this.store.select(isValidPickupAddressSelector).pipe(
					take(1),
					filter((isValidPickupAddress) => !isValidPickupAddress),
					mergeMap(() => {
						const address = localStorage.getItem(PICKUP_ADDRESS);
						if (address === null) {
							return of();
						}
						const pickupDetails = JSON.parse(address);
						return of(ParcelActions.setPickupDetails({ pickupDetails }));
					})
				);
			})
		)
	);

	searchMachineById = createEffect(() =>
		this.actions$.pipe(
			ofType(ParcelActions.seachMachine),
			switchMap((action) => {
				return this.parcelService.searchMichineById(action.id).pipe(
					mergeMap((res) => {
						if (res.error) {
							return of(ParcelActions.setError({ error: res.message }));
						}
						const pickupDetails = { ...res.address, _id: res._id };
						localStorage.setItem(PICKUP_ADDRESS, JSON.stringify(pickupDetails));
						return from([
							ParcelActions.setPickupDetails({pickupDetails}),
						]);
					}),
					catchError((error) => of(ParcelActions.setError({ error })))
				);
			})
		)
	);

	setError = createEffect(() => this.actions$.pipe(
		ofType(ParcelActions.setError),
		filter((action) => !!action.error),
		debounceTime(2000),
		map(() => ParcelActions.setError({error: null})),
	));

	searchAddress = createEffect(() =>
		this.actions$.pipe(
			ofType(ParcelActions.addressSearch),
			switchMap((action) => {
				return this.parcelService.searchAddressBook(action.request).pipe(
					mergeMap((res: any) => {
						if (res.error) {
							return of();
						}
						if (action.request.from === FromEnum.SHIPPER) {
							return of (ParcelActions.setShipperAddressBooks({ shipperAddressBooks: res }));
						}
						return of(ParcelActions.setAddressBooks({ addressBooks: res }));
					}),
				);
			})
		)
	);
	// savePickupAddress$ = createEffect(() =>
	// 	this.actions$.pipe(
	// 		ofType(ParcelActions.savePickupDetails),
	// 		switchMap((action) => {
	// 			return this.parcelService.savePickupAddress(action.pickupDetails).pipe(
	// 				mergeMap((res) => {
	// 					const pickupDetails = {...action.pickupDetails, id: res._id};
	// 					localStorage.setItem(PICKUP_ADDRESS, JSON.stringify(pickupDetails));
	// 					return from([
	// 						ParcelActions.setPickupDetails({pickupDetails}),
	// 					]);
	// 				}),
	// 				catchError(() => EMPTY)
	// 			);
	// 		})
	// 	)
	// );

	constructor() {}
}
